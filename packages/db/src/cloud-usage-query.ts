// Runs whole queries, unlike task-list-query's condition builders: the admin repo shares them and vendors packages/db but not packages/trpc.
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
import { organizations, users } from "./schema/auth";
import type {
	CloudWorkspaceBootEndReason,
	CloudWorkspaceFailureReason,
	CloudWorkspaceStatus,
} from "./schema/enums";
import {
	cloudWorkspaceBoots as boots,
	cloudUsageEvents as events,
	taskProjects,
	cloudWorkspaces as workspaces,
} from "./schema/schema";

export type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export const cloudUsageGroupByValues = ["user", "day", "workspace"] as const;
export type CloudUsageGroupBy = (typeof cloudUsageGroupByValues)[number];

export const cloudFleetGroupByValues = [
	...cloudUsageGroupByValues,
	"organization",
	"project",
	"size",
	"endReason",
] as const;
export type CloudFleetGroupBy = (typeof cloudFleetGroupByValues)[number];

/** What a customer sees: one organization, and for a member only their own rows. */
export interface CloudUsageScope {
	organizationId: string;
	/** Set for a member: every result holds only this user's rows. */
	userId?: string;
}

declare const fleetBrand: unique symbol;

/**
 * Staff only: every organization, or one. A customer router cannot build it: `CloudUsageScope` does
 * not satisfy it, and the only constructor is `cloudFleetScope` in cloud-usage-fleet.ts, which a
 * test keeps out of everything but this package.
 */
export interface CloudFleetScope {
	readonly [fleetBrand]: true;
	organizationId?: string;
	userId?: undefined;
}

type AnyScope = CloudUsageScope | CloudFleetScope;

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

/**
 * `gbMinutes` is the exact sum as decimal digits with an optional fraction (`1080`, `16.5`); it is
 * cast to numeric in SQL, so the router must check that format. Grouped by day, only `key` is used.
 */
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
	scope: AnyScope,
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

const sizeOfBoot = sql`case ${boots.vcpus} ${sql.join(
	MACHINE_SIZES.map(
		(size) => sql`when ${MACHINE_SIZE_VCPUS[size]} then ${size}`,
	),
	sql` `,
)} end`;

const sizeOfWorkspace = sql`coalesce(${workspaces.machineSize}, ${LEGACY_MACHINE_SIZE})`;

const bootSize = (size: MachineSize) =>
	eq(boots.vcpus, MACHINE_SIZE_VCPUS[size]);

const utcDay = (column: AnyPgColumn) =>
	sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`;

type FactKeys = Record<"event" | "boot" | "failed", SQL>;

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
	organization: {
		event: sql`${events.organizationId}`,
		boot: sql`${boots.organizationId}`,
		failed: sql`${workspaces.organizationId}`,
	},
	project: {
		event: sql`${workspaces.projectId}`,
		boot: sql`${workspaces.projectId}`,
		failed: sql`${workspaces.projectId}`,
	},
	size: {
		event: sizeOfBoot,
		boot: sizeOfBoot,
		failed: sizeOfWorkspace,
	},
	endReason: {
		event: sql`${boots.endReason}`,
		boot: sql`${boots.endReason}`,
		failed: sql`null`,
	},
} satisfies Record<CloudFleetGroupBy, FactKeys>;

const NO_KEY: FactKeys = {
	event: sql`null`,
	boot: sql`null`,
	failed: sql`null`,
};

/**
 * One row per sent event (placed at sent_at) and one per boot (placed at started_at), in one
 * shape, so a single GROUP BY gives usage and boot counts for any key. Each workspace that failed
 * in the window adds a row with no usage, so one with no boot still counts and has a group. Every
 * total, grouping and period goes through here, so there is one rule for failed workspaces.
 */
function usageFacts(
	db: Db,
	scope: AnyScope,
	filters: CloudUsageFilters,
	window: CloudUsageWindow,
	keys: FactKeys,
) {
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
				scope.organizationId
					? eq(events.organizationId, scope.organizationId)
					: undefined,
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
				scope.organizationId
					? eq(boots.organizationId, scope.organizationId)
					: undefined,
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
				scope.organizationId
					? eq(workspaces.organizationId, scope.organizationId)
					: undefined,
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

interface UserRef {
	id: string;
	name: string;
	email: string;
}

interface WorkspaceRef {
	id: string;
	name: string;
	status: CloudWorkspaceStatus;
	size: MachineSize;
	owner: UserRef | null;
	failure: { reason: CloudWorkspaceFailureReason; at: Date } | null;
}

interface OrganizationRef {
	id: string;
	name: string;
	slug: string;
}

interface ProjectRef {
	id: string;
	name: string;
}

async function refsFor(
	db: Db,
	organizationId: string | undefined,
	groupBy: CloudFleetGroupBy,
	keys: string[],
): Promise<Map<string, UserRef | WorkspaceRef | OrganizationRef | ProjectRef>> {
	if (keys.length === 0) return new Map();
	if (groupBy === "organization") {
		const rows = await db
			.select({
				id: organizations.id,
				name: organizations.name,
				slug: organizations.slug,
			})
			.from(organizations)
			.where(inArray(organizations.id, keys));
		return new Map(rows.map((row) => [row.id, row]));
	}
	if (groupBy === "project") {
		const rows = await db
			.select({ id: taskProjects.id, name: taskProjects.name })
			.from(taskProjects)
			.where(inArray(taskProjects.id, keys));
		return new Map(rows.map((row) => [row.id, row]));
	}
	if (groupBy !== "user" && groupBy !== "workspace") {
		return new Map();
	}
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
				organizationId
					? eq(workspaces.organizationId, organizationId)
					: undefined,
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

interface CloudUsageOptions<GroupBy> {
	window: CloudUsageWindow;
	filters?: CloudUsageFilters;
	groupBy?: GroupBy;
	limit: number;
	cursor?: CloudUsageCursor;
	overagePerGbHour: number | null;
}

/** These groupings have no entity behind the key: the key is the label. */
const isPlainKey = (groupBy: CloudFleetGroupBy) =>
	groupBy === "day" || groupBy === "size" || groupBy === "endReason";

/**
 * Billed usage (box_gb_minutes events, placed by sent_at) and boot counts (placed by started_at)
 * in the window: a total, and with `groupBy` one row per user, UTC day or workspace (a fleet scope
 * adds organization, project, size and end reason). Pages ordered by amount are read at each call:
 * an event sent between pages can move a row across the cursor.
 */
async function runUsage(
	db: Db,
	scope: AnyScope,
	options: CloudUsageOptions<CloudFleetGroupBy>,
) {
	const {
		window,
		filters = {},
		groupBy,
		cursor,
		limit,
		overagePerGbHour,
	} = options;
	const totalFacts = usageFacts(db, scope, filters, window, NO_KEY);
	const totalRow = db
		.with(totalFacts)
		.select(metricColumns(totalFacts))
		.from(totalFacts)
		.then(([row]) => {
			if (!row)
				throw new Error("An aggregate without GROUP BY returned no row");
			return row;
		});
	if (!groupBy) {
		return {
			items: [],
			total: toMetrics(await totalRow, overagePerGbHour),
			nextCursor: null,
		};
	}

	const facts = usageFacts(db, scope, filters, window, groupKeys[groupBy]);
	const metrics = metricColumns(facts);
	const sortKey = sql<string>`coalesce(${facts.key}, '')`;
	const [rows, total] = await Promise.all([
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
		totalRow,
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
				label: ref ? ref.name : isPlainKey(groupBy) ? key : null,
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

type CloudFleetUsageResult = Awaited<ReturnType<typeof runUsage>>;

export type CloudUsageResult = Omit<CloudFleetUsageResult, "items"> & {
	items: Array<
		Omit<CloudFleetUsageResult["items"][number], "ref"> & {
			ref: UserRef | WorkspaceRef | null;
		}
	>;
};

export function queryCloudUsage(
	db: Db,
	scope: CloudUsageScope,
	options: CloudUsageOptions<CloudUsageGroupBy>,
): Promise<CloudUsageResult>;
export function queryCloudUsage(
	db: Db,
	scope: CloudFleetScope,
	options: CloudUsageOptions<CloudFleetGroupBy>,
): Promise<CloudFleetUsageResult>;
export function queryCloudUsage(
	db: Db,
	scope: AnyScope,
	options: CloudUsageOptions<CloudFleetGroupBy>,
) {
	return runUsage(db, scope, options);
}

const NO_USAGE: MetricRow = {
	gbMinutes: "0",
	seconds: "0",
	boots: 0,
	failedBoots: 0,
	workspaces: 0,
};

/** The usage total of each period, in one query, in the order given. */
export async function queryCloudUsageByPeriod(
	db: Db,
	scope: CloudUsageScope,
	options: { periods: CloudUsageWindow[]; overagePerGbHour: number | null },
): Promise<Array<CloudUsageWindow & { metrics: CloudUsageMetrics }>> {
	const { periods, overagePerGbHour } = options;
	if (periods.length === 0) return [];
	const periodOf = (column: AnyPgColumn) =>
		sql`case ${sql.join(
			periods.map(
				({ from, to }, index) =>
					sql`when ${column} >= ${from.toISOString()}::timestamptz and ${column} < ${to.toISOString()}::timestamptz then ${String(index)}`,
			),
			sql` `,
		)} end`;
	const span = {
		from: new Date(Math.min(...periods.map(({ from }) => from.getTime()))),
		to: new Date(Math.max(...periods.map(({ to }) => to.getTime()))),
	};
	const facts = usageFacts(db, scope, {}, span, {
		event: periodOf(events.sentAt),
		boot: periodOf(boots.startedAt),
		failed: periodOf(workspaces.failedAt),
	});
	const rows = await db
		.with(facts)
		.select({ key: facts.key, ...metricColumns(facts) })
		.from(facts)
		.groupBy(facts.key);
	const byPeriod = new Map(rows.map(({ key, ...row }) => [key, row]));
	return periods.map((period, index) => ({
		...period,
		metrics: toMetrics(
			byPeriod.get(String(index)) ?? NO_USAGE,
			overagePerGbHour,
		),
	}));
}

/**
 * Boot rows that started in the window, newest first, each with the sum of its sent events. A fleet
 * scope lists across organizations, and every row names its organization. A failed start that never
 * got a boot row is not listed here: it is a workspace, counted by `queryCloudUsage`.
 */
export async function listCloudBoots(
	db: Db,
	scope: AnyScope,
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
			organization: {
				id: organizations.id,
				name: organizations.name,
				slug: organizations.slug,
			},
			workspace: { id: workspaces.id, name: workspaces.name },
			user: { id: users.id, name: users.name, email: users.email },
			startedAt: boots.startedAt,
			stoppedAt: boots.stoppedAt,
			memoryMb: boots.memoryMb,
			vcpus: boots.vcpus,
			endReason: boots.endReason,
			activeCpuMs: boots.activeCpuMs,
			egressBytes: boots.egressBytes,
			gbMinutes: sql<string>`(select coalesce(sum(${events.amount}), 0) from ${events} where ${events.bootId} = ${boots.id} and ${events.feature} = ${BILLED_FEATURE} and ${events.sentAt} is not null)`,
		})
		.from(boots)
		.leftJoin(organizations, eq(organizations.id, boots.organizationId))
		.leftJoin(workspaces, eq(workspaces.id, boots.cloudWorkspaceId))
		.leftJoin(users, eq(users.id, boots.createdByUserId))
		.where(
			and(
				scope.organizationId
					? eq(boots.organizationId, scope.organizationId)
					: undefined,
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
		items: page.map(
			({ gbMinutes, memoryMb, activeCpuMs, egressBytes, ...row }) => ({
				...row,
				activeCpuMinutes: activeCpuMs === null ? null : activeCpuMs / 60_000,
				egressGb: egressBytes === null ? null : egressBytes / 1024 ** 3,
				minutes:
					((row.stoppedAt ?? now).getTime() - row.startedAt.getTime()) / 60_000,
				size: sizeOfVcpus.get(row.vcpus) ?? null,
				memoryGb: memoryMb / 1024,
				gbHours: Number(gbMinutes) / 60,
				usageUsd: usd(Number(gbMinutes), overagePerGbHour),
			}),
		),
		nextCursor:
			rows.length > limit && last
				? { startedAt: last.startedAt, id: last.id }
				: null,
	};
}

export type CloudBootsResult = Awaited<ReturnType<typeof listCloudBoots>>;
