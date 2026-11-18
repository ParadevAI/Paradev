import {
	isMachineSize,
	LEGACY_MACHINE_SIZE,
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
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type {
	AnyPgColumn,
	PgDatabase,
	PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import { users } from "./schema/auth";
import type {
	CloudWorkspaceBootEndReason,
	CloudWorkspaceStatus,
} from "./schema/enums";
import {
	cloudWorkspaceBoots as boots,
	cloudUsageEvents as events,
	cloudWorkspaces as workspaces,
} from "./schema/schema";

type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export const cloudUsageGroupByValues = ["user", "day", "workspace"] as const;
export type CloudUsageGroupBy = (typeof cloudUsageGroupByValues)[number];

export interface CloudUsageScope {
	organizationId: string;
	/** Set for a member: every result holds only this user's rows. */
	userId?: string;
}

export interface CloudUsageFilters {
	user?: string;
	workspace?: string;
	size?: MachineSize;
	status?: CloudWorkspaceStatus[];
}

export interface CloudUsageWindow {
	from: Date;
	to: Date;
}

/** `gbMinutes` is the exact numeric sum as text; grouped by day, only `key` is used. */
export interface CloudUsageCursor {
	gbMinutes: string;
	key: string;
}

export interface CloudBootCursor {
	startedAt: Date;
	id: string;
}

/**
 * Autumn resets the GB-minute balance monthly on a fixed day of the month, on the last day of a
 * shorter month, at the time of day of `resetsAt`. `previousResetAt` is the reset that opened the
 * period, when the caller knows it: it settles the day when `resetsAt` is a short month's last day.
 */
export interface CloudBillingAnchor {
	resetsAt: Date;
	previousResetAt: Date | null;
}

function lastDayOfMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function anchorDay({ resetsAt, previousResetAt }: CloudBillingAnchor): number {
	const day = resetsAt.getUTCDate();
	const isMonthEnd =
		day === lastDayOfMonth(resetsAt.getUTCFullYear(), resetsAt.getUTCMonth());
	return isMonthEnd && previousResetAt
		? Math.max(day, previousResetAt.getUTCDate())
		: day;
}

function resetMonthsBefore(anchor: CloudBillingAnchor, months: number): Date {
	const reset = new Date(anchor.resetsAt);
	reset.setUTCDate(1);
	reset.setUTCMonth(reset.getUTCMonth() - months);
	reset.setUTCDate(
		Math.min(
			anchorDay(anchor),
			lastDayOfMonth(reset.getUTCFullYear(), reset.getUTCMonth()),
		),
	);
	return reset;
}

/** Period 0 is the open one, ending at `resetsAt`; period n ends n resets earlier. */
export function cloudBillingPeriod(
	anchor: CloudBillingAnchor,
	index: number,
): CloudUsageWindow {
	return {
		from: resetMonthsBefore(anchor, index + 1),
		to: resetMonthsBefore(anchor, index),
	};
}

/** The index of the period that starts on `startDate` (YYYY-MM-DD, UTC), or null if none does. */
export function cloudBillingPeriodIndex(
	anchor: CloudBillingAnchor,
	startDate: string,
): number | null {
	const [year, month] = startDate.split("-").map(Number);
	if (!year || !month) return null;
	const index =
		(anchor.resetsAt.getUTCFullYear() - year) * 12 +
		anchor.resetsAt.getUTCMonth() -
		month;
	return index >= 0 &&
		cloudBillingPeriod(anchor, index).from.toISOString().slice(0, 10) ===
			startDate
		? index
		: null;
}

const BILLED_FEATURE = "box_gb_minutes";

const sizeOfVcpus = new Map<number, MachineSize>(
	MACHINE_SIZES.map((size) => [MACHINE_SIZE_VCPUS[size], size]),
);

function usd(gbMinutes: number, overagePerGbHour: number | null) {
	return overagePerGbHour === null
		? null
		: Math.round((gbMinutes / 60) * overagePerGbHour * 100) / 100;
}

function scopeConditions(
	scope: CloudUsageScope,
	filters: CloudUsageFilters,
	columns: {
		user: AnyPgColumn;
		workspace: AnyPgColumn;
		size: (size: MachineSize) => SQL;
	},
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

const utcDay = (column: AnyPgColumn) =>
	sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`;

const groupKeys = {
	user: {
		event: sql`${events.userId}`,
		boot: sql`${boots.createdByUserId}`,
		failed: sql`${workspaces.createdByUserId}`,
	},
	day: {
		event: utcDay(events.sentAt),
		boot: utcDay(boots.startedAt),
		failed: utcDay(workspaces.failedAt),
	},
	workspace: {
		event: sql`${events.cloudWorkspaceId}`,
		boot: sql`${boots.cloudWorkspaceId}`,
		failed: sql`${workspaces.id}`,
	},
} satisfies Record<CloudUsageGroupBy, Record<"event" | "boot" | "failed", SQL>>;

/**
 * One row per sent event (placed at sent_at) and one per boot (placed at started_at), in one
 * shape, so a single GROUP BY gives usage and boot counts for any key. Each workspace that failed
 * in the window adds a row with no usage, so one with no boot still counts and has a group.
 */
function usageFacts(
	db: Db,
	scope: CloudUsageScope,
	filters: CloudUsageFilters,
	window: CloudUsageWindow,
	groupBy: CloudUsageGroupBy | undefined,
) {
	const keys = groupBy
		? groupKeys[groupBy]
		: { event: sql`null`, boot: sql`null`, failed: sql`null` };
	const sent = db
		.select({
			key: sql<string | null>`${keys.event}::text`.as("key"),
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
			key: sql<string | null>`${keys.boot}::text`,
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
	const failed = db
		.select({
			key: sql<string | null>`${keys.failed}::text`,
			workspaceId: sql<string | null>`${workspaces.id}`,
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
						sql`coalesce(${workspaces.machineSize}, ${LEGACY_MACHINE_SIZE}) = ${size}`,
				}),
			),
		);
	return db.$with("facts").as(sent.unionAll(started).unionAll(failed));
}

function metricColumns(facts: ReturnType<typeof usageFacts>) {
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

type MetricColumns = ReturnType<typeof metricColumns>;
type MetricRow = { [K in keyof MetricColumns]: MetricColumns[K]["_"]["type"] };

/** An aggregate without GROUP BY always returns one row; this only satisfies the type. */
const NO_ROWS: MetricRow = {
	gbMinutes: "0",
	seconds: "0",
	boots: 0,
	failedBoots: 0,
	workspaces: 0,
};

function toMetrics(row: MetricRow, overagePerGbHour: number | null) {
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

export type CloudUsageMetrics = ReturnType<typeof toMetrics>;

async function refsFor(
	db: Db,
	organizationId: string,
	groupBy: CloudUsageGroupBy,
	keys: string[],
) {
	if (groupBy === "day" || keys.length === 0) return new Map<string, never>();
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
		.where(
			and(
				eq(workspaces.organizationId, organizationId),
				inArray(workspaces.id, keys),
			),
		);
	return new Map(
		rows.map(({ machineSize, failureReason, failedAt, ...row }) => [
			row.id,
			{
				...row,
				size: isMachineSize(machineSize) ? machineSize : LEGACY_MACHINE_SIZE,
				failure:
					row.status === "failed" && failureReason && failedAt
						? { reason: failureReason, at: failedAt }
						: null,
			},
		]),
	);
}

/**
 * Billed usage (box_gb_minutes events, placed by sent_at) and boot counts (placed by started_at)
 * in the window: a total, and with `groupBy` one row per user, UTC day or workspace. Pages ordered
 * by amount are read at each call: an event sent between pages can move a row across the cursor.
 */
export async function queryCloudUsage(
	db: Db,
	scope: CloudUsageScope,
	options: {
		window: CloudUsageWindow;
		filters?: CloudUsageFilters;
		groupBy?: CloudUsageGroupBy;
		limit: number;
		cursor?: CloudUsageCursor;
		overagePerGbHour: number | null;
	},
) {
	const {
		window,
		filters = {},
		groupBy,
		cursor,
		limit,
		overagePerGbHour,
	} = options;
	const totalFacts = usageFacts(db, scope, filters, window, undefined);
	const totalQuery = db
		.with(totalFacts)
		.select(metricColumns(totalFacts))
		.from(totalFacts);
	if (!groupBy) {
		const [total = NO_ROWS] = await totalQuery;
		return {
			items: [],
			total: toMetrics(total, overagePerGbHour),
			nextCursor: null,
		};
	}

	const facts = usageFacts(db, scope, filters, window, groupBy);
	const metrics = metricColumns(facts);
	const sortKey = sql<string>`coalesce(${facts.key}, '')`;
	const [rows, [total = NO_ROWS]] = await Promise.all([
		db
			.with(facts)
			.select({ key: facts.key, sortKey, ...metrics })
			.from(facts)
			.groupBy(facts.key)
			.having(
				!cursor
					? undefined
					: groupBy === "day"
						? sql`${facts.key} < ${cursor.key}`
						: or(
								sql`${metrics.gbMinutes} < ${cursor.gbMinutes}::numeric`,
								sql`${metrics.gbMinutes} = ${cursor.gbMinutes}::numeric and ${sortKey} > ${cursor.key}`,
							),
			)
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
	const refs = await refsFor(
		db,
		scope.organizationId,
		groupBy,
		page.flatMap((row) => (row.key ? [row.key] : [])),
	);
	return {
		items: page.map(({ key, sortKey: _, ...row }) => {
			const ref = (key && refs.get(key)) || null;
			return {
				key,
				label: groupBy === "day" ? key : (ref?.name ?? null),
				ref,
				...toMetrics(row, overagePerGbHour),
			};
		}),
		total: toMetrics(total, overagePerGbHour),
		nextCursor:
			rows.length > limit && last
				? { gbMinutes: last.gbMinutes, key: last.sortKey }
				: null,
	};
}

export type CloudUsageResult = Awaited<ReturnType<typeof queryCloudUsage>>;

/** Boot rows that started in the window, newest first, each with the sum of its sent events. */
export async function listCloudBoots(
	db: Db,
	scope: CloudUsageScope,
	options: {
		window: CloudUsageWindow;
		filters?: CloudUsageFilters;
		endReason?: CloudWorkspaceBootEndReason[];
		open?: boolean;
		limit: number;
		cursor?: CloudBootCursor;
		now: Date;
		overagePerGbHour: number | null;
	},
) {
	const {
		window,
		filters = {},
		cursor,
		limit,
		now,
		overagePerGbHour,
	} = options;
	const rows = await db
		.select({
			id: boots.id,
			sessionId: boots.vercelSessionId,
			workspace: { id: workspaces.id, name: workspaces.name },
			user: { id: users.id, name: users.name, email: users.email },
			startedAt: boots.startedAt,
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
				gte(boots.startedAt, window.from),
				lt(boots.startedAt, window.to),
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
				cursor &&
					or(
						lt(boots.startedAt, cursor.startedAt),
						and(eq(boots.startedAt, cursor.startedAt), lt(boots.id, cursor.id)),
					),
			),
		)
		.orderBy(desc(boots.startedAt), desc(boots.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	return {
		items: page.map(({ gbMinutes, memoryMb, ...row }) => ({
			...row,
			minutes:
				((row.stoppedAt ?? now).getTime() - row.startedAt.getTime()) / 60_000,
			size: sizeOfVcpus.get(row.vcpus) ?? null,
			memoryGb: memoryMb / 1024,
			gbHours: Number(gbMinutes) / 60,
			usageUsd: usd(Number(gbMinutes), overagePerGbHour),
		})),
		nextCursor:
			rows.length > limit && last
				? { startedAt: last.startedAt, id: last.id }
				: null,
	};
}

export type CloudBootsResult = Awaited<ReturnType<typeof listCloudBoots>>;
