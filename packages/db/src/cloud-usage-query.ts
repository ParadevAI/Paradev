import {
	isMachineSize,
	MACHINE_SIZE_VCPUS,
	MACHINE_SIZES,
	type MachineSize,
} from "@superset/shared/billing";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	type SQL,
	sql,
} from "drizzle-orm";
import type {
	AnyPgColumn,
	PgDatabase,
	PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import {
	type bootsResultSchema,
	type CloudUsageFilters,
	type Metrics,
	type periodsResultSchema,
	type Range,
	rangePresetDays,
	type UsageGroupBy,
	type usageResultSchema,
} from "./cloud-usage-schemas";
import { users } from "./schema/auth";
import type { CloudWorkspaceBootEndReason } from "./schema/enums";
import {
	cloudWorkspaceBoots as boots,
	cloudUsageEvents as events,
	cloudWorkspaces as workspaces,
} from "./schema/schema";

type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export interface CloudUsageScope {
	organizationId: string;
	/** Set for a member: every result holds only this user's rows. */
	userId?: string;
}

export interface Window {
	from: Date;
	to: Date;
}

/** The open period as Autumn reports it, in GB-hours, with the plan's overage rate. */
export interface CloudBilling {
	includedGbHours: number | null;
	usedGbHours: number;
	overageGbHours: number;
	prepaidRemainingGbHours: number;
	resetsAt: Date;
	overagePerGbHour: number | null;
}

export interface CloudBillingReader {
	/** null when billing is off, the organization has no Autumn customer, or Autumn has no reset time. */
	billing(organizationId: string): Promise<CloudBilling | null>;
}

export class CloudUsageInputError extends Error {
	override name = "CloudUsageInputError";
}

const BILLED_FEATURE = "box_gb_minutes";
const DAY_MS = 86_400_000;

function addUtcMonths(date: Date, months: number): Date {
	const result = new Date(date);
	result.setUTCDate(1);
	result.setUTCMonth(result.getUTCMonth() + months);
	const lastDay = new Date(
		Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
	).getUTCDate();
	result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
	return result;
}

/** Period 0 is the open one; each step back is one month from Autumn's next reset. */
function periodWindow(resetsAt: Date, index: number): Window {
	return {
		from: addUtcMonths(resetsAt, -(index + 1)),
		to: addUtcMonths(resetsAt, -index),
	};
}

function utcDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function periodIndex(resetsAt: Date, id: string): number | null {
	const [year, month] = id.split("-").map(Number) as [number, number];
	const index =
		(resetsAt.getUTCFullYear() - year) * 12 + resetsAt.getUTCMonth() - month;
	return index >= 0 && utcDate(periodWindow(resetsAt, index).from) === id
		? index
		: null;
}

export function resolveRange(
	range: Range,
	now: Date,
	resetsAt: Date | null,
): Window {
	if (typeof range === "string") {
		return {
			from: new Date(now.getTime() - rangePresetDays[range] * DAY_MS),
			to: now,
		};
	}
	if ("from" in range) {
		const window = { from: new Date(range.from), to: new Date(range.to) };
		if (window.from > window.to) {
			throw new CloudUsageInputError("range.from is after range.to");
		}
		return window;
	}
	if (!resetsAt) {
		throw new CloudUsageInputError("A period range needs a billing period");
	}
	const index =
		range.period === "current" ? 0 : periodIndex(resetsAt, range.period);
	if (index === null) {
		throw new CloudUsageInputError(`No billing period ${range.period}`);
	}
	return periodWindow(resetsAt, index);
}

function encodeCursor(value: object): string {
	return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor<T>(schema: z.ZodType<T>, cursor: string): T {
	try {
		return schema.parse(
			JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
		);
	} catch {
		throw new CloudUsageInputError("Invalid cursor");
	}
}

const sizeOfVcpus = new Map<number, MachineSize>(
	MACHINE_SIZES.map((size) => [MACHINE_SIZE_VCPUS[size], size]),
);

function utcDay(column: AnyPgColumn): SQL<string> {
	return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`;
}

function usd(gbMinutes: number, overagePerGbHour: number | null) {
	return overagePerGbHour === null
		? null
		: Math.round((gbMinutes / 60) * overagePerGbHour * 100) / 100;
}

interface ScopedColumns {
	user: AnyPgColumn;
	workspace: AnyPgColumn;
	size: (size: MachineSize) => SQL;
}

function scopeConditions(
	scope: CloudUsageScope,
	filters: CloudUsageFilters,
	columns: ScopedColumns,
): SQL[] {
	const conditions: SQL[] = [];
	if (scope.userId) conditions.push(eq(columns.user, scope.userId));
	if (filters.user) conditions.push(eq(columns.user, filters.user));
	if (filters.workspace) {
		conditions.push(eq(columns.workspace, filters.workspace));
	}
	if (filters.size) conditions.push(columns.size(filters.size));
	if (filters.status?.length) {
		conditions.push(inArray(workspaces.status, filters.status));
	}
	return conditions;
}

const bootSize = (size: MachineSize) =>
	eq(boots.vcpus, MACHINE_SIZE_VCPUS[size]);

interface FactKeys {
	event: SQL;
	boot: SQL;
	/** Adds a zero row for each workspace that failed in the window, so one with no boot still has a group. */
	failedWorkspace?: SQL;
}

/**
 * One row per billed event (counted at sent_at) and one per boot (counted at started_at), in the
 * same shape, so a single GROUP BY gives usage and boot counts for any key.
 */
function usageFacts(
	db: Db,
	scope: CloudUsageScope,
	filters: CloudUsageFilters,
	window: Window,
	keys: FactKeys | null,
) {
	const noKey = sql`null`;
	const billed = db
		.select({
			key: sql<string | null>`${keys?.event ?? noKey}::text`.as("key"),
			workspaceId: sql<string | null>`${events.cloudWorkspaceId}`.as(
				"workspace_id",
			),
			gbMinutes: sql<string>`${events.amount}`.as("gb_minutes"),
			seconds:
				sql<string>`extract(epoch from ${events.windowTo} - ${events.windowFrom})`.as(
					"seconds",
				),
			bootId: sql<string | null>`null::text`.as("boot_id"),
			failed: sql<boolean>`false`.as("failed"),
		})
		.from(events)
		.leftJoin(boots, eq(boots.id, events.bootId))
		.leftJoin(workspaces, eq(workspaces.id, events.cloudWorkspaceId))
		.where(
			and(
				eq(events.organizationId, scope.organizationId),
				eq(events.feature, BILLED_FEATURE),
				gte(events.sentAt, window.from),
				lt(events.sentAt, window.to),
				...scopeConditions(scope, filters, {
					user: events.userId,
					workspace: events.cloudWorkspaceId,
					size: bootSize,
				}),
			),
		);
	const started = db
		.select({
			key: sql<string | null>`${keys?.boot ?? noKey}::text`,
			workspaceId: sql<string | null>`${boots.cloudWorkspaceId}`,
			gbMinutes: sql<string>`0::numeric`,
			seconds: sql<string>`0::numeric`,
			bootId: sql<string | null>`${boots.id}`,
			failed: sql<boolean>`${boots.endReason} is not distinct from 'failed'`,
		})
		.from(boots)
		.leftJoin(workspaces, eq(workspaces.id, boots.cloudWorkspaceId))
		.where(
			and(
				eq(boots.organizationId, scope.organizationId),
				gte(boots.startedAt, window.from),
				lt(boots.startedAt, window.to),
				...scopeConditions(scope, filters, {
					user: boots.createdByUserId,
					workspace: boots.cloudWorkspaceId,
					size: bootSize,
				}),
			),
		);
	if (!keys?.failedWorkspace) {
		return db.$with("facts").as(billed.unionAll(started));
	}
	const failed = db
		.select({
			key: sql<string | null>`${keys.failedWorkspace}::text`,
			workspaceId: sql<string | null>`null::uuid`,
			gbMinutes: sql<string>`0::numeric`,
			seconds: sql<string>`0::numeric`,
			bootId: sql<string | null>`null::text`,
			failed: sql<boolean>`false`,
		})
		.from(workspaces)
		.where(
			and(
				eq(workspaces.organizationId, scope.organizationId),
				eq(workspaces.status, "failed"),
				isNull(workspaces.deletedAt),
				gte(workspaces.failedAt, window.from),
				lt(workspaces.failedAt, window.to),
				...scopeConditions(scope, filters, {
					user: workspaces.createdByUserId,
					workspace: workspaces.id,
					size: (size) =>
						sql`coalesce(${workspaces.machineSize}, 'large') = ${size}`,
				}),
			),
		);
	return db.$with("facts").as(billed.unionAll(started).unionAll(failed));
}

type Facts = ReturnType<typeof usageFacts>;

function metricColumns(facts: Facts) {
	return {
		gbMinutes: sql<string>`coalesce(sum(${facts.gbMinutes}), 0)`,
		seconds: sql<string>`coalesce(sum(${facts.seconds}), 0)`,
		boots: sql<number>`count(${facts.bootId})`.mapWith(Number),
		failedBoots: sql<number>`count(*) filter (where ${facts.failed})`.mapWith(
			Number,
		),
		workspaces: sql<number>`count(distinct ${facts.workspaceId})`.mapWith(
			Number,
		),
	};
}

type MetricRow = {
	gbMinutes: string;
	seconds: string;
	boots: number;
	failedBoots: number;
	workspaces: number;
};

const ZERO: MetricRow = {
	gbMinutes: "0",
	seconds: "0",
	boots: 0,
	failedBoots: 0,
	workspaces: 0,
};

function toMetrics(row: MetricRow, overagePerGbHour: number | null): Metrics {
	const gbMinutes = Number(row.gbMinutes);
	return {
		workspaces: row.workspaces,
		boots: row.boots,
		failedBoots: row.failedBoots,
		hours: Number(row.seconds) / 3600,
		gbHours: gbMinutes / 60,
		usageUsd: usd(gbMinutes, overagePerGbHour),
	};
}

function groupKeys(groupBy: UsageGroupBy): FactKeys {
	switch (groupBy) {
		case "user":
			return {
				event: sql`${events.userId}`,
				boot: sql`${boots.createdByUserId}`,
			};
		case "workspace":
			return {
				event: sql`${events.cloudWorkspaceId}`,
				boot: sql`${boots.cloudWorkspaceId}`,
				failedWorkspace: sql`${workspaces.id}`,
			};
		case "day":
			return { event: utcDay(events.sentAt), boot: utcDay(boots.startedAt) };
	}
}

const dayCursor = z.object({ key: z.iso.date() });
const amountCursor = z.object({
	gbMinutes: z.string().regex(/^\d+(\.\d+)?$/),
	key: z.string(),
});

async function labelsFor(
	db: Db,
	groupBy: UsageGroupBy,
	keys: string[],
): Promise<
	Map<string, z.infer<typeof usageResultSchema>["items"][number]["ref"]>
> {
	if (groupBy === "day" || keys.length === 0) return new Map();
	if (groupBy === "user") {
		const rows = await db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(inArray(users.id, keys));
		return new Map(rows.map((row) => [row.id, row]));
	}
	const rows = await db
		.select({
			id: workspaces.id,
			name: workspaces.name,
			status: workspaces.status,
			machineSize: workspaces.machineSize,
			failureReason: workspaces.failureReason,
			failedAt: workspaces.failedAt,
			owner: { id: users.id, name: users.name, email: users.email },
		})
		.from(workspaces)
		.leftJoin(users, eq(users.id, workspaces.createdByUserId))
		.where(inArray(workspaces.id, keys));
	return new Map(
		rows.map((row) => [
			row.id,
			{
				id: row.id,
				name: row.name,
				status: row.status,
				size: isMachineSize(row.machineSize) ? row.machineSize : "large",
				owner: row.owner,
				failure:
					row.status === "failed" && row.failureReason && row.failedAt
						? { reason: row.failureReason, at: row.failedAt.toISOString() }
						: null,
			},
		]),
	);
}

/**
 * Billed usage (cloud_usage_events, box_gb_minutes, placed by sent_at) and boot counts (placed by
 * started_at), as a total and optionally grouped by user, UTC day or workspace.
 */
export async function queryCloudUsage(
	db: Db,
	scope: CloudUsageScope,
	options: {
		range: Window;
		filters?: CloudUsageFilters;
		groupBy?: UsageGroupBy;
		limit: number;
		cursor?: string | null;
		overagePerGbHour: number | null;
	},
): Promise<z.infer<typeof usageResultSchema>> {
	const { range, filters = {}, groupBy, limit, overagePerGbHour } = options;
	const result = {
		range: { from: range.from.toISOString(), to: range.to.toISOString() },
		groupBy: groupBy ?? null,
	};
	const totalFacts = usageFacts(db, scope, filters, range, null);
	const totalQuery = db
		.with(totalFacts)
		.select(metricColumns(totalFacts))
		.from(totalFacts);
	if (!groupBy) {
		const [total] = await totalQuery;
		return {
			...result,
			items: [],
			total: toMetrics(total ?? ZERO, overagePerGbHour),
			nextCursor: null,
		};
	}

	const facts = usageFacts(db, scope, filters, range, groupKeys(groupBy));
	const metrics = metricColumns(facts);
	const sortKey = sql<string>`coalesce(${facts.key}, '')`;
	let after: SQL | undefined;
	if (options.cursor && groupBy === "day") {
		after = sql`${facts.key} < ${decodeCursor(dayCursor, options.cursor).key}`;
	} else if (options.cursor) {
		const cursor = decodeCursor(amountCursor, options.cursor);
		after = sql`(${metrics.gbMinutes} < ${cursor.gbMinutes}::numeric or (${metrics.gbMinutes} = ${cursor.gbMinutes}::numeric and ${sortKey} > ${cursor.key}))`;
	}
	const [rows, [total]] = await Promise.all([
		db
			.with(facts)
			.select({ key: facts.key, sortKey, ...metrics })
			.from(facts)
			.groupBy(facts.key)
			.having(after)
			.orderBy(
				...(groupBy === "day"
					? [desc(facts.key)]
					: [desc(metrics.gbMinutes), asc(sortKey)]),
			)
			.limit(limit + 1),
		totalQuery,
	]);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	const refs = await labelsFor(
		db,
		groupBy,
		page.flatMap((row) => (row.key ? [row.key] : [])),
	);
	return {
		...result,
		items: page.map((row) => {
			const ref = (row.key && refs.get(row.key)) || null;
			return {
				key: row.key,
				label: groupBy === "day" ? row.key : (ref?.name ?? null),
				ref,
				...toMetrics(row, overagePerGbHour),
			};
		}),
		total: toMetrics(total ?? ZERO, overagePerGbHour),
		nextCursor:
			rows.length > limit && last
				? encodeCursor(
						groupBy === "day"
							? { key: last.key }
							: { gbMinutes: last.gbMinutes, key: last.sortKey },
					)
				: null,
	};
}

const bootCursor = z.object({
	startedAt: z.iso.datetime({ precision: 6 }),
	id: z.string(),
});

/** Boot rows that started in the range, newest first, each with the sum of its sent usage events. */
export async function listCloudBoots(
	db: Db,
	scope: CloudUsageScope,
	options: {
		range: Window;
		filters?: CloudUsageFilters;
		endReason?: CloudWorkspaceBootEndReason[];
		open?: boolean;
		limit: number;
		cursor?: string | null;
		now: Date;
		overagePerGbHour: number | null;
	},
): Promise<z.infer<typeof bootsResultSchema>> {
	const { range, filters = {}, limit, now, overagePerGbHour } = options;
	const cursor = options.cursor
		? decodeCursor(bootCursor, options.cursor)
		: null;
	const rows = await db
		.select({
			id: boots.id,
			sessionId: boots.vercelSessionId,
			workspace: { id: workspaces.id, name: workspaces.name },
			user: { id: users.id, name: users.name, email: users.email },
			startedAt: boots.startedAt,
			startedAtKey: sql<string>`to_char(${boots.startedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
			stoppedAt: boots.stoppedAt,
			memoryMb: boots.memoryMb,
			vcpus: boots.vcpus,
			endReason: boots.endReason,
			gbMinutes: sql<string>`(select coalesce(sum(${events.amount}), 0) from ${events} where ${events.bootId} = ${boots.id} and ${events.feature} = ${BILLED_FEATURE} and ${events.sentAt} is not null)`,
		})
		.from(boots)
		.leftJoin(workspaces, eq(workspaces.id, boots.cloudWorkspaceId))
		.leftJoin(users, eq(users.id, boots.createdByUserId))
		.where(
			and(
				eq(boots.organizationId, scope.organizationId),
				gte(boots.startedAt, range.from),
				lt(boots.startedAt, range.to),
				...scopeConditions(scope, filters, {
					user: boots.createdByUserId,
					workspace: boots.cloudWorkspaceId,
					size: bootSize,
				}),
				options.endReason?.length
					? inArray(boots.endReason, options.endReason)
					: undefined,
				options.open === undefined
					? undefined
					: options.open
						? isNull(boots.stoppedAt)
						: isNotNull(boots.stoppedAt),
				cursor
					? sql`(${boots.startedAt}, ${boots.id}) < (${cursor.startedAt}::timestamptz, ${cursor.id})`
					: undefined,
			),
		)
		.orderBy(desc(boots.startedAt), desc(boots.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	return {
		range: { from: range.from.toISOString(), to: range.to.toISOString() },
		items: page.map((row) => {
			const gbMinutes = Number(row.gbMinutes);
			return {
				id: row.id,
				sessionId: row.sessionId,
				workspace: row.workspace,
				user: row.user,
				startedAt: row.startedAt.toISOString(),
				stoppedAt: row.stoppedAt?.toISOString() ?? null,
				minutes:
					((row.stoppedAt ?? now).getTime() - row.startedAt.getTime()) / 60_000,
				size: sizeOfVcpus.get(row.vcpus) ?? null,
				memoryGb: row.memoryMb / 1024,
				vcpus: row.vcpus,
				endReason: row.endReason,
				gbHours: gbMinutes / 60,
				usageUsd: usd(gbMinutes, overagePerGbHour),
			};
		}),
		nextCursor:
			rows.length > limit && last
				? encodeCursor({ startedAt: last.startedAtKey, id: last.id })
				: null,
	};
}

const periodCursor = z.object({ id: z.iso.date() });

/**
 * Billing periods newest first, from Autumn's next reset back one month at a time to the period of
 * the organization's first boot. The open period's allowance is Autumn's; a closed one has none.
 */
export async function listCloudPeriods(
	db: Db,
	scope: CloudUsageScope,
	reader: CloudBillingReader,
	options: { limit: number; cursor?: string | null },
): Promise<z.infer<typeof periodsResultSchema>> {
	const billing = await reader.billing(scope.organizationId);
	if (!billing) return { items: [], nextCursor: null };
	const { resetsAt } = billing;

	let first = 0;
	if (options.cursor) {
		const index = periodIndex(
			resetsAt,
			decodeCursor(periodCursor, options.cursor).id,
		);
		if (index === null) throw new CloudUsageInputError("Invalid cursor");
		first = index + 1;
	}
	const [firstBoot] = await db
		.select({
			startedAt: sql<Date | null>`min(${boots.startedAt})`.mapWith(
				boots.startedAt,
			),
		})
		.from(boots)
		.where(eq(boots.organizationId, scope.organizationId));
	let oldest = 0;
	while (
		firstBoot?.startedAt &&
		periodWindow(resetsAt, oldest).from > firstBoot.startedAt
	) {
		oldest++;
	}
	const page = Array.from(
		{ length: Math.max(0, Math.min(options.limit, oldest - first + 1)) },
		(_, offset) => {
			const index = first + offset;
			const window = periodWindow(resetsAt, index);
			return { index, id: utcDate(window.from), ...window };
		},
	);
	const newest = page[0];
	const last = page.at(-1);
	if (!newest || !last) return { items: [], nextCursor: null };

	const periodOf = (column: AnyPgColumn) =>
		sql`case ${sql.join(
			page.map(
				(period) =>
					sql`when ${column} >= ${period.from.toISOString()}::timestamptz and ${column} < ${period.to.toISOString()}::timestamptz then ${period.id}`,
			),
			sql` `,
		)} end`;
	const facts = usageFacts(
		db,
		scope,
		{},
		{ from: last.from, to: newest.to },
		{ event: periodOf(events.sentAt), boot: periodOf(boots.startedAt) },
	);
	const rows = await db
		.with(facts)
		.select({ key: facts.key, ...metricColumns(facts) })
		.from(facts)
		.groupBy(facts.key);
	const byId = new Map(rows.map((row) => [row.key, row]));

	return {
		items: page.map((period) => ({
			id: period.id,
			start: period.from.toISOString(),
			end: period.to.toISOString(),
			closed: period.index > 0,
			allowance:
				period.index === 0 && !scope.userId
					? {
							includedGbHours: billing.includedGbHours,
							usedGbHours: billing.usedGbHours,
							overageGbHours: billing.overageGbHours,
							prepaidRemainingGbHours: billing.prepaidRemainingGbHours,
							resetsAt: resetsAt.toISOString(),
						}
					: null,
			metrics: toMetrics(byId.get(period.id) ?? ZERO, billing.overagePerGbHour),
		})),
		nextCursor: last.index < oldest ? encodeCursor({ id: last.id }) : null,
	};
}
