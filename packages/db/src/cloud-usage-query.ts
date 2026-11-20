// Runs whole queries, unlike task-list-query's condition builders: the admin repo shares them and vendors packages/db but not packages/trpc.
import {
	BOX_GB_MINUTES_FEATURE_ID,
	gbMinutesUsd,
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
	ilike,
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
	cloudUsageDaily as daily,
	cloudUsageEvents as events,
	taskProjects,
	cloudWorkspaces as workspaces,
} from "./schema/schema";
import { escapeLikePattern } from "./utils/like";

export { gbMinutesUsd };

export type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** `day` is the UTC day of sent_at; `billingDay` is the Pacific billing day, from the daily rollup. */
export const cloudUsageGroupByValues = [
	"user",
	"day",
	"workspace",
	"billingDay",
] as const;
export type CloudUsageGroupBy = (typeof cloudUsageGroupByValues)[number];

export const cloudFleetGroupByValues = [
	...cloudUsageGroupByValues,
	"organization",
	"project",
	"size",
	"endReason",
] as const;
export type CloudFleetGroupBy = (typeof cloudFleetGroupByValues)[number];

export interface CloudUsageScope {
	organizationId: string;
	/** Set for a member: every result holds only this user's rows. */
	userId?: string;
}

/** Only the fleet entry points pass `null` (every organization) or a list. */
type Scope = { organizationId: string | string[] | null; userId?: string };

const inOrganization = (scope: Scope, column: AnyPgColumn) =>
	scope.organizationId === null
		? undefined
		: Array.isArray(scope.organizationId)
			? inArray(column, scope.organizationId)
			: eq(column, scope.organizationId);

const workspaceOf = (scope: Scope, column: AnyPgColumn) =>
	and(
		eq(workspaces.id, column),
		inOrganization(scope, workspaces.organizationId),
	);

export interface CloudUsageFilters {
	user?: string;
	workspace?: string | string[];
	size?: MachineSize;
	status?: CloudWorkspaceStatus[];
	/** Part of the workspace name, in any case. */
	search?: string;
}

export interface CloudUsageWindow {
	from: Date;
	to: Date;
}

export const cloudUsageSortValues = [
	"gbHours",
	"hours",
	"boots",
	"name",
	"status",
] as const;

/** `name` and `status` are the workspace's, so they need grouping by workspace. */
export interface CloudUsageSort {
	by: (typeof cloudUsageSortValues)[number];
	order: "asc" | "desc";
}

/**
 * `value` is the last row's sort value: the workspace name for `name`, else decimal digits with an
 * optional fraction (`1080`, `16.5`) that is cast to numeric in SQL, so the router must check that
 * format. Grouped by day with no sort, only `key` is used.
 */
export interface CloudUsageCursor {
	value: string;
	key: string;
}

export interface CloudBootCursor {
	startedAt: Date;
	id: string;
}

/** Autumn resets the GB-minute balance monthly on `day`, or a shorter month's last day, at the time of day of `resetsAt`. */
export interface CloudBillingAnchor {
	resetsAt: Date;
	day: number;
}

function lastDayOfMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthsAfter(date: Date, months: number, day: number): Date {
	const moved = new Date(date);
	moved.setUTCDate(1);
	moved.setUTCMonth(moved.getUTCMonth() + months);
	moved.setUTCDate(
		Math.min(day, lastDayOfMonth(moved.getUTCFullYear(), moved.getUTCMonth())),
	);
	return moved;
}

/**
 * Autumn anchors the monthly reset on the subscription's start, to the millisecond. A start that
 * does not land on `resetsAt` (a plan change, a trial) says nothing, so `resetsAt`'s day is used.
 */
export function cloudBillingAnchor(
	resetsAt: Date,
	startedAt: Date | null,
): CloudBillingAnchor {
	const months = startedAt
		? (resetsAt.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 +
			resetsAt.getUTCMonth() -
			startedAt.getUTCMonth()
		: 0;
	const proven =
		startedAt !== null &&
		monthsAfter(startedAt, months, startedAt.getUTCDate()).getTime() ===
			resetsAt.getTime();
	return {
		resetsAt,
		day: proven ? startedAt.getUTCDate() : resetsAt.getUTCDate(),
	};
}

/** Period 0 is the open one, ending at `resetsAt`; period n ends n resets earlier. */
export function cloudBillingPeriod(
	anchor: CloudBillingAnchor,
	index: number,
): CloudUsageWindow {
	return {
		from: monthsAfter(anchor.resetsAt, -(index + 1), anchor.day),
		to: monthsAfter(anchor.resetsAt, -index, anchor.day),
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

const sizeOfVcpus = new Map<number, MachineSize>(
	MACHINE_SIZES.map((size) => [MACHINE_SIZE_VCPUS[size], size]),
);

function scopeConditions(
	scope: Scope,
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
		conditions.push(
			Array.isArray(filters.workspace)
				? inArray(columns.workspace, filters.workspace)
				: eq(columns.workspace, filters.workspace),
		);
	}
	if (filters.size) conditions.push(columns.size(filters.size));
	if (filters.status?.length) {
		conditions.push(inArray(workspaces.status, filters.status));
	}
	if (filters.search) {
		conditions.push(
			ilike(workspaces.name, `%${escapeLikePattern(filters.search)}%`),
		);
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

const STATUS_ORDER: CloudWorkspaceStatus[] = [
	"failed",
	"provisioning",
	"awake",
	"asleep",
	"archived",
];

const statusRank = sql`case ${workspaces.status} ${sql.join(
	STATUS_ORDER.map(
		(status, rank) => sql`when ${status} then ${sql.raw(String(rank))}`,
	),
	sql` `,
)} end`;

const bootSize = (size: MachineSize) =>
	eq(boots.vcpus, MACHINE_SIZE_VCPUS[size]);

export function billingDay(column: AnyPgColumn | SQL) {
	return sql<string>`to_char(public.cloud_billing_day(${column}), 'YYYY-MM-DD')`;
}

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
		failed: sql`'failed'`,
	},
	billingDay: {
		event: billingDay(events.sentAt),
		boot: billingDay(boots.startedAt),
		failed: billingDay(workspaces.failedAt),
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
 * in the window adds a row with no usage, so one with no boot still counts and has a group; grouped
 * by end reason it is keyed `failed`, as a boot that failed is.
 */
function usageFacts(
	db: Db,
	scope: Scope,
	filters: CloudUsageFilters,
	window: CloudUsageWindow,
	keys: FactKeys,
	secondKeys: FactKeys = NO_KEY,
	options: {
		/** Narrows the sent events, for the days the rollup does not cover. */
		sentWhere?: SQL;
		/** Usage rows from the daily rollup, in the facts' shape. */
		days?: NonNullable<ReturnType<typeof billingDayRollup>>["days"];
	} = {},
) {
	const sent = db
		.select({
			key: sql<string | null>`${keys.event}::text`.as("key"),
			secondKey: sql<string | null>`${secondKeys.event}::text`.as("second_key"),
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
			day: sql<string>`${utcDay(events.sentAt)}`.as("day"),
		})
		.from(events)
		.leftJoin(boots, eq(boots.id, events.bootId))
		.leftJoin(workspaces, workspaceOf(scope, events.cloudWorkspaceId))
		.where(
			and(
				inOrganization(scope, events.organizationId),
				eq(events.feature, BOX_GB_MINUTES_FEATURE_ID),
				gte(events.sentAt, window.from),
				lt(events.sentAt, window.to),
				options.sentWhere,
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
			secondKey: sql<string | null>`${secondKeys.boot}::text`,
			workspaceId: sql<string | null>`${boots.cloudWorkspaceId}`,
			gbMinutes: sql<string>`0::numeric`,
			seconds: sql<string>`0::numeric`,
			bootId: sql<string | null>`${boots.id}`,
			failed: sql<boolean>`${boots.endReason} is not distinct from 'failed'`,
			day: sql<string>`${utcDay(boots.startedAt)}`,
		})
		.from(boots)
		.leftJoin(workspaces, workspaceOf(scope, boots.cloudWorkspaceId))
		.where(
			and(
				inOrganization(scope, boots.organizationId),
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
			secondKey: sql<string | null>`${secondKeys.failed}::text`,
			workspaceId: sql<string | null>`${workspaces.id}`,
			gbMinutes: sql<string>`0::numeric`,
			seconds: sql<string>`0::numeric`,
			bootId: sql<string | null>`null::text`,
			failed: sql<boolean>`false`,
			day: sql<string>`${utcDay(workspaces.failedAt)}`,
		})
		.from(workspaces)
		.where(
			and(
				inOrganization(scope, workspaces.organizationId),
				eq(workspaces.status, "failed"),
				isNull(workspaces.deletedAt),
				gte(workspaces.failedAt, window.from),
				lt(workspaces.failedAt, window.to),
				...scopeConditions(scope, filters, {
					user: workspaces.createdByUserId,
					workspace: workspaces.id,
					size: (size) => sql`${sizeOfWorkspace} = ${size}`,
				}),
			),
		);
	const facts = sent.unionAll(started).unionAll(failed);
	return db
		.$with("facts")
		.as(options.days ? facts.unionAll(options.days) : facts);
}

/**
 * Usage by billing day from the daily rollup: its rows for the billing days wholly inside the
 * window, and `sentWhere` for the events of the partial days at the window's edges. Each event
 * lands in exactly one part. Null when a filter the rollup cannot apply (workspace, status, search)
 * is set: then every day reads events.
 */
function billingDayRollup(
	db: Db,
	scope: Scope,
	filters: CloudUsageFilters,
	window: CloudUsageWindow,
) {
	if (filters.workspace || filters.status?.length || filters.search) {
		return null;
	}
	const from = sql`${window.from.toISOString()}::timestamptz`;
	const to = sql`${window.to.toISOString()}::timestamptz`;
	const fromDay = sql`public.cloud_billing_day(${from})`;
	const firstWhole = sql`(case when public.cloud_billing_day_start(${fromDay}) = ${from} then ${fromDay} else ${fromDay} + 1 end)`;
	const endWhole = sql`public.cloud_billing_day(${to})`;
	return {
		sentWhere: sql`(${events.sentAt} < public.cloud_billing_day_start(${firstWhole}) or ${events.sentAt} >= public.cloud_billing_day_start(${endWhole}))`,
		days: db
			.select({
				key: sql<string | null>`to_char(${daily.day}::date, 'YYYY-MM-DD')`,
				secondKey: sql<string | null>`null::text`,
				workspaceId: sql<string | null>`null::uuid`,
				gbMinutes: sql<string>`${daily.gbMinutes}`,
				seconds: sql<string>`${daily.seconds}`,
				bootId: sql<string | null>`null::text`,
				failed: sql<boolean>`false`,
				day: sql<string>`null::text`,
			})
			.from(daily)
			.where(
				and(
					inOrganization(scope, daily.organizationId),
					sql`${daily.day} >= ${firstWhole}`,
					sql`${daily.day} < ${endWhole}`,
					sql`${daily.events} <> 0`,
					scope.userId ? eq(daily.userId, scope.userId) : undefined,
					filters.user ? eq(daily.userId, filters.user) : undefined,
					filters.size
						? eq(daily.vcpus, MACHINE_SIZE_VCPUS[filters.size])
						: undefined,
				),
			),
	};
}

interface DayRow {
	day: string;
	gbMinutes: number;
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
		usageUsd: gbMinutesUsd(gbMinutes, overagePerGbHour),
	};
}

export type CloudUsageMetrics = ReturnType<typeof toMetrics>;

/** Grouped by billing day there is no workspaces count: the rollup has no workspace. */
function usageMetrics(
	metrics: CloudUsageMetrics,
	byBillingDay: boolean,
): Omit<CloudUsageMetrics, "workspaces"> & { workspaces: number | null } {
	return byBillingDay ? { ...metrics, workspaces: null } : metrics;
}

/** These groupings have no entity behind the key: the key is the label. */
const isPlainKey = (groupBy: CloudFleetGroupBy) =>
	groupBy === "day" ||
	groupBy === "billingDay" ||
	groupBy === "size" ||
	groupBy === "endReason";

interface UserRef {
	id: string;
	name: string;
	email: string;
	image: string | null;
}

interface WorkspaceRef {
	id: string;
	name: string;
	status: CloudWorkspaceStatus;
	/** Deleted workspaces keep the status they had; this says they are gone. */
	deleted: boolean;
	size: MachineSize;
	owner: UserRef | null;
	failure: { reason: CloudWorkspaceFailureReason; at: Date } | null;
	/**
	 * The newest boot the scope may see, in any window. `stoppedAt` is null while it runs; a stopped
	 * boot with no end reason is from before end reasons were kept.
	 */
	lastBoot: {
		endReason: CloudWorkspaceBootEndReason | null;
		stoppedAt: Date | null;
	} | null;
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
	scope: Scope,
	groupBy: CloudFleetGroupBy,
	keys: string[],
): Promise<Map<string, UserRef | WorkspaceRef | OrganizationRef | ProjectRef>> {
	if (keys.length === 0 || isPlainKey(groupBy)) return new Map();
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
	if (groupBy === "user") {
		const rows = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				image: users.image,
			})
			.from(users)
			.where(inArray(users.id, keys));
		return new Map(rows.map((row) => [row.id, row]));
	}
	const [rows, lastBoots] = await Promise.all([
		db
			.select({
				id: workspaces.id,
				name: workspaces.name,
				status: workspaces.status,
				deleted: sql<boolean>`${workspaces.deletedAt} is not null`,
				machineSize: workspaces.machineSize,
				failureReason: workspaces.failureReason,
				failedAt: workspaces.failedAt,
				owner: {
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
				},
			})
			.from(workspaces)
			.leftJoin(users, eq(users.id, workspaces.createdByUserId))
			.where(
				and(
					inOrganization(scope, workspaces.organizationId),
					inArray(workspaces.id, keys),
				),
			),
		db
			.selectDistinctOn([boots.cloudWorkspaceId], {
				workspaceId: boots.cloudWorkspaceId,
				endReason: boots.endReason,
				stoppedAt: boots.stoppedAt,
			})
			.from(boots)
			.where(
				and(
					inOrganization(scope, boots.organizationId),
					inArray(boots.cloudWorkspaceId, keys),
					scope.userId ? eq(boots.createdByUserId, scope.userId) : undefined,
				),
			)
			.orderBy(boots.cloudWorkspaceId, desc(boots.startedAt), desc(boots.id)),
	]);
	const lastBootOf = new Map(
		lastBoots.map(({ workspaceId, ...lastBoot }) => [workspaceId, lastBoot]),
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
				lastBoot: lastBootOf.get(row.id) ?? null,
			},
		]),
	);
}

interface CloudUsageOptions<GroupBy> {
	window: CloudUsageWindow;
	filters?: CloudUsageFilters;
	groupBy?: GroupBy;
	/** Default: by day newest first, else by GB-hours, most first. */
	sort?: CloudUsageSort;
	limit: number;
	cursor?: CloudUsageCursor;
	overagePerGbHour: number | null;
	/** By billing day, read every day from events, not the rollup. */
	fromEvents?: boolean;
}

type CloudFleetUsageOptions = CloudUsageOptions<CloudFleetGroupBy> & {
	refs?: boolean;
};

/**
 * One page of rows grouped by person, each with the person's days. The page is ranked first, so
 * the days are summed for its people only, once each, in the same statement.
 */
function pageWithDays(
	db: Db,
	facts: ReturnType<typeof usageFacts>,
	{
		sortKey,
		sortValue,
		having,
		order,
		limit,
	}: {
		sortKey: SQL<string>;
		sortValue: SQL;
		having: SQL | undefined;
		order: SQL[];
		limit: number;
	},
) {
	const metrics = metricColumns(facts);
	const page = db.$with("page").as(
		db
			.select({
				key: facts.key,
				sortKey: sortKey.as("sort_key"),
				sortValue: sql<string>`(${sortValue})::text`.as("sort_value"),
				gbMinutes: metrics.gbMinutes.as("total_gb_minutes"),
				seconds: metrics.seconds.as("total_seconds"),
				boots: metrics.boots.as("total_boots"),
				failedBoots: metrics.failedBoots.as("total_failed_boots"),
				workspaces: metrics.workspaces.as("total_workspaces"),
				rank: sql<number>`row_number() over (order by ${sql.join(order, sql`, `)})`.as(
					"rank",
				),
			})
			.from(facts)
			.groupBy(facts.key)
			.having(having)
			.orderBy(...order)
			.limit(limit),
	);
	const perDay = db
		.select({
			key: sql<string>`coalesce(${facts.key}, '')`.as("days_key"),
			day: facts.day,
			gbMinutes: sql<string>`sum(${facts.gbMinutes})`.as("day_gb_minutes"),
		})
		.from(facts)
		.where(
			sql`coalesce(${facts.key}, '') in (select ${page.sortKey} from ${page})`,
		)
		.groupBy(facts.key, facts.day)
		.as("per_day");
	const userDays = db.$with("user_days").as(
		db
			.select({
				key: perDay.key,
				days: sql<
					DayRow[]
				>`json_agg(json_build_object('day', ${perDay.day}, 'gbMinutes', ${perDay.gbMinutes}) order by ${perDay.day})`.as(
					"days",
				),
			})
			.from(perDay)
			.groupBy(perDay.key),
	);
	return db
		.with(facts, page, userDays)
		.select({
			key: page.key,
			sortKey: page.sortKey,
			sortValue: page.sortValue,
			gbMinutes: page.gbMinutes,
			seconds: page.seconds,
			boots: page.boots,
			failedBoots: page.failedBoots,
			workspaces: page.workspaces,
			days: userDays.days,
		})
		.from(page)
		.leftJoin(userDays, eq(userDays.key, page.sortKey))
		.orderBy(page.rank);
}

/**
 * Billed usage (box_gb_minutes events, placed by sent_at) and boot counts (placed by started_at)
 * in the window: a total, and with `groupBy` one row per user, UTC day or workspace (a fleet scope
 * adds organization, project, size and end reason). Pages ordered by amount are read at each call:
 * an event sent between pages can move a row across the cursor.
 */
async function usageRows(
	db: Db,
	scope: Scope,
	options: CloudFleetUsageOptions,
) {
	const {
		window,
		filters = {},
		groupBy,
		cursor,
		limit,
		overagePerGbHour,
	} = options;
	const byBillingDay = groupBy === "billingDay";
	const rollup =
		byBillingDay && !options.fromEvents
			? billingDayRollup(db, scope, filters, window)
			: null;
	const totalFacts = usageFacts(
		db,
		scope,
		filters,
		window,
		NO_KEY,
		NO_KEY,
		rollup ?? {},
	);
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
			total: usageMetrics(
				toMetrics(await totalRow, overagePerGbHour),
				byBillingDay,
			),
			rowCount: 0,
			nextCursor: null,
		};
	}

	const sort =
		options.sort ??
		(groupBy === "day" || byBillingDay
			? null
			: { by: "gbHours", order: "desc" });
	if (
		(sort?.by === "name" || sort?.by === "status") &&
		groupBy !== "workspace"
	) {
		throw new Error(`Sorting by ${sort.by} needs grouping by workspace`);
	}
	const facts = usageFacts(
		db,
		scope,
		filters,
		window,
		groupKeys[groupBy],
		NO_KEY,
		rollup ?? {},
	);
	const metrics = metricColumns(facts);
	const withDays = groupBy === "user";
	const sortKey = sql<string>`coalesce(${facts.key}, '')`;
	const ofWorkspace = (column: AnyPgColumn | SQL) =>
		sql`(select ${column} from ${workspaces} where ${workspaces.id} = ${facts.key}::uuid)`;
	const sortValue = !sort
		? sortKey
		: {
				gbHours: metrics.gbMinutes,
				hours: metrics.seconds,
				boots: metrics.boots,
				name: sql`coalesce(${ofWorkspace(workspaces.name)}, '')`,
				status: sql`coalesce(${ofWorkspace(statusRank)}, ${sql.raw(String(STATUS_ORDER.length))})`,
			}[sort.by];
	const cursorValue =
		cursor &&
		(sort?.by === "name"
			? sql`${cursor.value}`
			: sql`${cursor.value}::numeric`);
	const having = !cursor
		? undefined
		: !sort
			? sql`${facts.key} < ${cursor.key}`
			: or(
					sort.order === "desc"
						? sql`${sortValue} < ${cursorValue}`
						: sql`${sortValue} > ${cursorValue}`,
					sql`${sortValue} = ${cursorValue} and ${sortKey} > ${cursor.key}`,
				);
	const order = !sort
		? [desc(facts.key)]
		: [sort.order === "desc" ? desc(sortValue) : asc(sortValue), asc(sortKey)];
	const [rows, total, rowCount] = await Promise.all([
		withDays
			? pageWithDays(db, facts, {
					sortKey,
					sortValue,
					having,
					order,
					limit: limit + 1,
				})
			: db
					.with(facts)
					.select({
						key: facts.key,
						sortKey,
						sortValue: sql<string>`(${sortValue})::text`,
						days: sql<null>`null`,
						...metrics,
					})
					.from(facts)
					.groupBy(facts.key)
					.having(having)
					.orderBy(...order)
					.limit(limit + 1),
		totalRow,
		db
			.with(facts)
			.select({
				rowCount: sql<number>`count(distinct ${sortKey})`.mapWith(Number),
			})
			.from(facts)
			.then(([row]) => row?.rowCount ?? 0),
	]);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	const refs =
		options.refs === false
			? new Map()
			: await refsFor(
					db,
					scope,
					groupBy,
					page.flatMap((row) => (row.key ? [row.key] : [])),
				);
	return {
		items: page.map((row) => {
			const { key, sortKey: _, sortValue: __, days, ...metricRow } = row;
			const ref = (key && refs.get(key)) || null;
			return {
				key,
				label: ref ? ref.name : isPlainKey(groupBy) ? key : null,
				ref,
				...usageMetrics(toMetrics(metricRow, overagePerGbHour), byBillingDay),
				...(withDays && {
					days: (days ?? []).map((day) => ({
						day: day.day,
						gbHours: day.gbMinutes / 60,
						usageUsd: gbMinutesUsd(day.gbMinutes, overagePerGbHour),
					})),
				}),
			};
		}),
		total: usageMetrics(toMetrics(total, overagePerGbHour), byBillingDay),
		rowCount,
		nextCursor:
			rows.length > limit && last
				? { value: last.sortValue, key: last.sortKey }
				: null,
	};
}

type CloudFleetUsageResult = Awaited<ReturnType<typeof usageRows>>;

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
): Promise<CloudUsageResult> {
	return usageRows(db, scope, options) as Promise<CloudUsageResult>;
}

/**
 * `queryCloudUsage` across organizations (`organizationId: null`), for some or for one, with more
 * groupings. `refs: false` skips the lookup of names, so a group has no `ref` and, unless its key is
 * its own label, no `label`. Staff only: biome.jsonc forbids importing it outside this package, and
 * `queryCloudUsage` accepts only a `CloudUsageScope`, whose organization id is a string.
 */
export function queryFleetCloudUsage(
	db: Db,
	organizationId: string | string[] | null,
	options: CloudFleetUsageOptions,
): Promise<CloudFleetUsageResult> {
	return usageRows(db, { organizationId }, options);
}

/**
 * `queryFleetCloudUsage` grouped by workspace and Pacific billing day in one query: a row for each
 * pair with a fact, no limit, so the caller windows it. Staff only, like `queryFleetCloudUsage`.
 */
export async function queryFleetCloudUsageByWorkspaceDay(
	db: Db,
	organizationId: string | string[] | null,
	options: { window: CloudUsageWindow; filters?: CloudUsageFilters },
) {
	const facts = usageFacts(
		db,
		{ organizationId },
		options.filters ?? {},
		options.window,
		groupKeys.workspace,
		{
			event: billingDay(events.sentAt),
			boot: billingDay(boots.startedAt),
			failed: billingDay(workspaces.failedAt),
		},
	);
	const rows = await db
		.with(facts)
		.select({
			workspaceId: facts.key,
			day: facts.secondKey,
			...metricColumns(facts),
		})
		.from(facts)
		.groupBy(facts.key, facts.secondKey)
		.orderBy(asc(facts.key), asc(facts.secondKey));
	return rows.map(({ workspaceId, day, ...row }) => {
		if (day === null) throw new Error("A usage fact has no billing day.");
		const { boots, failedBoots, hours, gbHours } = toMetrics(row, null);
		return {
			workspaceId,
			day,
			boots,
			failedBoots,
			hours,
			gbHours,
		};
	});
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

interface CloudBootsOptions {
	window: CloudUsageWindow;
	filters?: CloudUsageFilters;
	endReason?: CloudWorkspaceBootEndReason[];
	open?: boolean;
	limit: number;
	cursor?: CloudBootCursor;
	now: Date;
	overagePerGbHour: number | null;
}

interface BootReadOptions extends Omit<CloudBootsOptions, "window"> {
	window?: CloudUsageWindow;
	/** A boot id or a Vercel session id. */
	boot?: string;
}

const bootColumns = {
	id: boots.id,
	sessionId: boots.vercelSessionId,
	workspace: { id: workspaces.id, name: workspaces.name },
	user: {
		id: users.id,
		name: users.name,
		email: users.email,
		image: users.image,
	},
	startedAt: boots.startedAt,
	stoppedAt: boots.stoppedAt,
	memoryMb: boots.memoryMb,
	vcpus: boots.vcpus,
	endReason: boots.endReason,
	gbMinutes: sql<string>`(select coalesce(sum(${events.amount}), 0) from ${events} where ${events.bootId} = ${boots.id} and ${events.feature} = ${BOX_GB_MINUTES_FEATURE_ID} and ${events.sentAt} is not null)`,
};

function bootConditions(scope: Scope, options: BootReadOptions) {
	const { window, cursor } = options;
	return and(
		inOrganization(scope, boots.organizationId),
		window && gte(boots.startedAt, window.from),
		window && lt(boots.startedAt, window.to),
		options.boot
			? or(eq(boots.id, options.boot), eq(boots.vercelSessionId, options.boot))
			: undefined,
		...scopeConditions(scope, options.filters ?? {}, {
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
	);
}

const selectBootRows = (db: Db) =>
	db
		.select(bootColumns)
		.from(boots)
		.leftJoin(workspaces, eq(workspaces.id, boots.cloudWorkspaceId))
		.leftJoin(users, eq(users.id, boots.createdByUserId));

type BootRow = Awaited<ReturnType<typeof selectBootRows>>[number];

/** `rows` were fetched one past the limit. */
function bootPage<Row extends BootRow>(rows: Row[], options: BootReadOptions) {
	const { limit, now, overagePerGbHour } = options;
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
			usageUsd: gbMinutesUsd(Number(gbMinutes), overagePerGbHour),
		})),
		nextCursor:
			rows.length > limit && last
				? { startedAt: last.startedAt, id: last.id }
				: null,
	};
}

/**
 * Boot rows that started in the window, newest first, each with the sum of its sent events. A failed
 * start with no boot row is not listed: it is a workspace, counted by `queryCloudUsage`.
 */
export async function listCloudBoots(
	db: Db,
	scope: CloudUsageScope,
	options: CloudBootsOptions,
) {
	const rows = await selectBootRows(db)
		.where(bootConditions(scope, options))
		.orderBy(desc(boots.startedAt), desc(boots.id))
		.limit(options.limit + 1);
	return bootPage(rows, options);
}

export type CloudBootsResult = Awaited<ReturnType<typeof listCloudBoots>>;

async function fleetBoots(db: Db, scope: Scope, options: BootReadOptions) {
	const rows = await db
		.select({
			...bootColumns,
			organization: {
				id: organizations.id,
				name: organizations.name,
				slug: organizations.slug,
			},
			activeCpuMs: boots.activeCpuMs,
			egressBytes: boots.egressBytes,
			phases: boots.phases,
			traceId: boots.traceId,
			origin: boots.origin,
		})
		.from(boots)
		.leftJoin(organizations, eq(organizations.id, boots.organizationId))
		.leftJoin(workspaces, eq(workspaces.id, boots.cloudWorkspaceId))
		.leftJoin(users, eq(users.id, boots.createdByUserId))
		.where(bootConditions(scope, options))
		.orderBy(desc(boots.startedAt), desc(boots.id))
		.limit(options.limit + 1);
	const { items, nextCursor } = bootPage(rows, options);
	return {
		items: items.map(({ activeCpuMs, egressBytes, ...boot }) => ({
			...boot,
			activeCpuMinutes: activeCpuMs === null ? null : activeCpuMs / 60_000,
			egressGb: egressBytes === null ? null : egressBytes / 1024 ** 3,
		})),
		nextCursor,
	};
}

export type CloudFleetBootsResult = Awaited<ReturnType<typeof fleetBoots>>;

/**
 * `listCloudBoots` across organizations (`organizationId: null`), for some or for one, with the
 * organization, active CPU, egress, phases, trace id and origin of each boot. Staff only, like `queryFleetCloudUsage`.
 */
export function listFleetCloudBoots(
	db: Db,
	organizationId: string | string[] | null,
	options: CloudBootsOptions,
) {
	return fleetBoots(db, { organizationId }, options);
}

/** One boot by boot id or Vercel session id, in any organization, or null. Staff only. */
export async function getFleetCloudBoot(
	db: Db,
	boot: string,
	options: { now: Date; overagePerGbHour: number | null },
) {
	const {
		items: [found],
	} = await fleetBoots(
		db,
		{ organizationId: null },
		{ ...options, boot, limit: 1 },
	);
	return found ?? null;
}
