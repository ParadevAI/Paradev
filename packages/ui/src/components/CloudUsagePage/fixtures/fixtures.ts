import {
	type CloudUsage as BillingValue,
	cloudUsageFromBalances,
} from "@superset/auth/billing/cloud-usage";
import { type MachineSize, machineSpec } from "@superset/shared/billing";
import { allowanceOf } from "@superset/trpc/cloud-allowance";
import type {
	CloudBoot,
	CloudPages,
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	CloudUsageRow,
	PersonRef,
	WorkspaceRef,
} from "../types";
import { type Priced, priced } from "../utils/priced";

/**
 * Story data in the router's output shapes, for states the router can return. Each allowance
 * goes through the billing reader and the router's own mapping, from an Autumn balance built
 * here. Seeded and on a fixed clock, so every build draws the same pages.
 */

const RATE = 0.06;
const MINUTES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The stories' clock; `.storybook/fixedClock.ts` sets the same instant. */
export const STORY_NOW = new Date("2026-11-18T14:00:00Z");
const PERIOD_END = new Date("2026-11-27T00:00:00Z");
/** The share of the open period's usage each earlier period had, newest first. */
const PERIOD_SHARE = [1, 0.86, 0.71, 0.58, 0.44, 0];

type Row = Priced<CloudUsageRow>;
type Usage = Priced<CloudUsage>;
type Boot = Priced<CloudBoot>;
type Range = CloudUsage["range"];

function seeded(start: number) {
	let state = start;
	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}
const random = seeded(7);
const pick = <T>(items: readonly T[]): T =>
	items[Math.floor(random() * items.length)] as T;

export const PEOPLE: PersonRef[] = [
	"Priya Natarajan",
	"Ines Duarte",
	"Sam Reyes",
	"Theo Okafor",
	"Maya Chen",
].map((name, i) => ({
	id: `00000000-0000-4000-8000-00000000000${i + 1}`,
	name,
	email: `${name.split(" ")[0]?.toLowerCase()}@example.com`,
}));
const [PRIYA, INES, SAM, THEO, MAYA] = PEOPLE as [
	PersonRef,
	PersonRef,
	PersonRef,
	PersonRef,
	PersonRef,
];

const WORDS = [
	"rate",
	"push",
	"drift",
	"oauth",
	"ranking",
	"sweep",
	"search",
	"deeplinks",
	"cli",
	"fix",
	"pipeline",
	"api",
	"warmup",
	"tokens",
	"mobile",
	"image",
	"checkout",
	"retry",
	"scopes",
	"sync",
	"rewrite",
	"copy",
	"terraform",
	"i18n",
	"webhooks",
	"flaky",
	"onboarding",
	"index",
	"audit",
	"limits",
	"export",
	"notif",
];
const SIZES: MachineSize[] = [
	"small",
	"medium",
	"medium",
	"large",
	"large",
	"xlarge",
];
const STATUSES: WorkspaceRef["status"][] = [
	"asleep",
	"asleep",
	"awake",
	"asleep",
	"awake",
	"archived",
];
/** A boot's usual length before it sleeps. */
const BOOT_HOURS = 3;
/** One page of the boots table. */
const MAX_BOOTS = 25;
const STOP_REASONS = ["idle", "user", "restarted", "idle"] as const;

const day = (date: Date) => date.toISOString().slice(0, 10);
const round2 = (value: number) => Math.round(value * 100) / 100;
const workspaceRef = (row: Row) =>
	row.ref && "status" in row.ref ? row.ref : null;

interface Seed {
	ref: WorkspaceRef;
	weight: number;
	stoppedAtLimit: boolean;
}

function workspaceSeeds(count: number, names?: string[]): Seed[] {
	return Array.from({ length: count }, (_, i) => {
		const status = i === 1 || i === count - 2 ? "failed" : pick(STATUSES);
		const ref: WorkspaceRef = {
			id: `ws-${i + 1}`,
			name: names?.[i] ?? `${pick(WORDS)}-${pick(WORDS)}-${pick(WORDS)}`,
			status,
			size: pick(SIZES),
			owner: i === 0 ? SAM : pick([PRIYA, PRIYA, INES, SAM, THEO, MAYA]),
			failure:
				status === "failed"
					? { reason: "snapshot_expired", at: new Date("2026-11-14T23:47:00Z") }
					: null,
			lastBoot: null,
		};
		return {
			ref,
			weight: 0.3 + random(),
			stoppedAtLimit: status === "asleep" && i % 5 === 2,
		};
	});
}

/** A workspace's boots in a range: `gbHours` split over boots of about `BOOT_HOURS`, newest first; the newest is open when awake. */
function bootsOf(seed: Seed, gbHours: number, range: Range): Boot[] {
	const { ref } = seed;
	const { memoryGb, vcpus } = machineSpec(ref.size);
	const count = Math.min(
		MAX_BOOTS,
		Math.max(1, Math.round(gbHours / memoryGb / BOOT_HOURS)),
	);
	const end = Math.min(range.to.getTime(), STORY_NOW.getTime());
	const span = end - range.from.getTime();
	const minutes = ((gbHours / count) * MINUTES) / memoryGb;
	return Array.from({ length: count }, (_, i) => {
		const open = i === 0 && ref.status === "awake";
		const startedAt = new Date(
			end - ((i + 0.5) / count) * span - (open ? 0 : minutes * MINUTES * 1000),
		);
		const endReason: CloudBoot["endReason"] = open
			? null
			: i === 0 && ref.status === "failed"
				? "failed"
				: i === 0 && seed.stoppedAtLimit
					? "usage_limit"
					: (STOP_REASONS[i % STOP_REASONS.length] ?? "idle");
		return {
			id: `${ref.id}-b${i + 1}`,
			sessionId: null,
			workspace: { id: ref.id, name: ref.name },
			user: ref.owner,
			startedAt,
			stoppedAt: open
				? null
				: new Date(startedAt.getTime() + minutes * MINUTES * 1000),
			minutes,
			size: ref.size,
			memoryGb,
			vcpus,
			endReason,
			gbHours: (minutes / MINUTES) * memoryGb,
			usageUsd: round2((minutes / MINUTES) * memoryGb * RATE),
		};
	});
}

function metricsOf(boots: Boot[]) {
	return {
		workspaces: new Set(boots.map((boot) => boot.workspace?.id)).size,
		boots: boots.length,
		failedBoots: boots.filter((boot) => boot.endReason === "failed").length,
		hours: boots.reduce((sum, boot) => sum + boot.minutes / MINUTES, 0),
		gbHours: boots.reduce((sum, boot) => sum + boot.gbHours, 0),
		usageUsd: round2(boots.reduce((sum, boot) => sum + boot.usageUsd, 0)),
	};
}

interface Fleet {
	rows: Row[];
	boots: Boot[];
}

/** The fleet's usage rows and boots for a range, holding `gbHours` in all. */
function fleet(seeds: Seed[], gbHours: number, range: Range): Fleet {
	if (gbHours <= 0) return { rows: [], boots: [] };
	const weights = seeds.reduce((sum, seed) => sum + seed.weight, 0);
	const boots: Boot[] = [];
	const rows = seeds.map((seed) => {
		const own = bootsOf(seed, (gbHours * seed.weight) / weights, range);
		boots.push(...own);
		const latest = own[0];
		const ref: WorkspaceRef = {
			...seed.ref,
			lastBoot: latest
				? { endReason: latest.endReason, stoppedAt: latest.stoppedAt }
				: null,
		};
		return { key: ref.id, label: ref.name, ref, ...metricsOf(own) };
	});
	return { rows: rows.sort((a, b) => b.gbHours - a.gbHours), boots };
}

const total = (rows: Row[]) => {
	const sum = (value: (row: Row) => number) =>
		rows.reduce((all, row) => all + value(row), 0);
	return {
		workspaces: rows.filter((row) => row.gbHours > 0).length,
		boots: sum((row) => row.boots),
		failedBoots: sum((row) => row.failedBoots),
		hours: sum((row) => row.hours),
		gbHours: sum((row) => row.gbHours),
		usageUsd: round2(sum((row) => row.usageUsd)),
	};
};

function usage(
	items: Row[],
	rows: Row[],
	range: Range,
	rowCount = items.length,
): Usage {
	return { range, items, total: total(rows), rowCount, nextCursor: null };
}

/** Removes dollars, as the router does with no rate. */
export const withoutRate = (page: Usage): CloudUsage => ({
	...page,
	items: page.items.map((item) => ({ ...item, usageUsd: null })),
	total: { ...page.total, usageUsd: null },
});

/** One row per day of the range up to today, as the router groups by day. */
function byDay({ rows, boots }: Fleet, range: Range): Usage {
	const days = new Map<string, Boot[]>();
	for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS) {
		if (t <= STORY_NOW.getTime()) days.set(day(new Date(t)), []);
	}
	for (const boot of boots) days.get(day(boot.startedAt))?.push(boot);
	const items = [...days].map(([key, list]) => ({
		key,
		label: key,
		ref: null,
		...metricsOf(list),
	}));
	return usage(items, rows, range);
}

function byPerson({ rows }: Fleet, range: Range): Usage {
	const items = PEOPLE.map((person) => ({
		key: person.id,
		label: person.name,
		ref: person,
		...total(rows.filter((row) => workspaceRef(row)?.owner?.id === person.id)),
	}))
		.filter((item) => item.gbHours > 0)
		.sort((a, b) => b.gbHours - a.gbHours);
	return usage(items, rows, range);
}

const TOP_WORKSPACES = 8;

// The organizations of the design's Customer tab: their seats, seat grant and usage.
const NORTHWIND = { seats: 14, perSeatGbHours: 500, usedGbHours: 15200 };
const NORTHWIND_SEEDS = workspaceSeeds(43);
const LONG_SEEDS = workspaceSeeds(12, [
	"migrate-the-whole-billing-pipeline-to-the-new-event-store-without-downtime",
	"fix-flaky",
	...Array.from(
		{ length: 10 },
		(_, i) => `refactor-onboarding-checklist-and-invite-flow-part-${i + 1}`,
	),
]).map((seed) =>
	seed.ref.owner?.id === PRIYA.id
		? {
				...seed,
				ref: {
					...seed.ref,
					owner: { ...PRIYA, name: "Priya Natarajan-Venkataraman Subramanian" },
				},
			}
		: seed,
);

const periodRange = (back: number): Range => ({
	from: new Date(Date.UTC(2026, 9 - back, 27)),
	to: new Date(Date.UTC(2026, 10 - back, 27)),
});
const CURRENT = periodRange(0);
const TODAY_START = Date.parse(`${day(STORY_NOW)}T00:00:00Z`);
/** The range with no billing periods: the last 30 UTC days, today included. */
const LAST_30_DAYS: Range = {
	from: new Date(TODAY_START - 29 * DAY_MS),
	to: new Date(TODAY_START + DAY_MS),
};

type Extra = "off" | { capGbHours: number } | { percent: number };

interface Billing {
	seats: number;
	perSeatGbHours: number;
	usedGbHours: number;
	freeCreditGbHours?: number;
	boughtGbHours?: number;
	extra: Extra;
	/** A value cached before seats, credits and the cap were read. */
	cached?: boolean;
}

type Balance = Parameters<typeof cloudUsageFromBalances>[0][string];
type Controls = NonNullable<Parameters<typeof cloudUsageFromBalances>[1]>;
const FEATURE = "box_gb_minutes";

/** Autumn's balance for a billing state: usage draws the seats' pool, then free credit, then bought credit, then extra usage. */
function autumnBalance(billing: Billing) {
	const pool = billing.seats * billing.perSeatGbHours;
	const free = billing.freeCreditGbHours ?? 0;
	const bought = billing.boughtGbHours ?? 0;
	let left = billing.usedGbHours;
	const draw = (amount: number) => {
		const drawn = Math.min(left, amount);
		left -= drawn;
		return drawn;
	};
	const inPool = draw(pool);
	const freeUsed = draw(free);
	const boughtUsed = draw(bought);
	const row = (
		id: string,
		included: number,
		prepaid: number,
		used: number,
		oneOff: boolean,
	) => ({
		id,
		planId: null,
		includedGrant: included * MINUTES,
		prepaidGrant: prepaid * MINUTES,
		remaining: (included + prepaid - used) * MINUTES,
		usage: used * MINUTES,
		unlimited: false,
		reset: oneOff
			? { interval: "one_off", resetsAt: null }
			: { interval: "month", resetsAt: PERIOD_END.getTime() },
		price:
			oneOff && prepaid > 0
				? {
						amount: RATE,
						billingUnits: MINUTES,
						billingMethod: "prepaid",
						maxPurchase: null,
					}
				: null,
		expiresAt: null,
	});
	const granted = pool + free + bought;
	const balance = {
		featureId: FEATURE,
		granted: granted * MINUTES,
		usage: billing.usedGbHours * MINUTES,
		remaining: (granted - billing.usedGbHours) * MINUTES,
		unlimited: false,
		overageAllowed: billing.extra !== "off",
		maxPurchase: null,
		nextResetAt: PERIOD_END.getTime(),
		breakdown: [
			row("monthly", pool, 0, inPool + left, false),
			...(free > 0 ? [row("credit", free, 0, freeUsed, true)] : []),
			...(bought > 0 ? [row("pack", 0, bought, boughtUsed, true)] : []),
		],
	} as Balance;
	const { extra } = billing;
	const controls = (
		extra === "off"
			? { overageAllowed: [{ featureId: FEATURE, enabled: false }] }
			: {
					spendLimits: [
						"capGbHours" in extra
							? {
									featureId: FEATURE,
									enabled: true,
									overageLimit: extra.capGbHours * MINUTES,
								}
							: {
									featureId: FEATURE,
									enabled: true,
									limitType: "usage_percentage",
									overageLimit: extra.percent,
								},
					],
				}
	) as Controls;
	return { balance, controls };
}

/** The open period's allowance and unavailable reasons, as the router returns them for `billing`. */
function billingPeriod(billing: Billing) {
	const { balance, controls } = autumnBalance(billing);
	const value = cloudUsageFromBalances(
		{ [FEATURE]: balance },
		controls,
		null,
		RATE,
		billing.seats,
	) as BillingValue;
	return allowanceOf(
		billing.cached
			? {
					...value,
					bought: null,
					freeCredits: null,
					seats: null,
					overageLimit: null,
					limitReached: null,
				}
			: value,
		PERIOD_END,
		RATE,
	);
}

const NORTHWIND_BILLING: Billing = {
	...NORTHWIND,
	freeCreditGbHours: 2000,
	extra: { capGbHours: 27000 },
};

/** Each billing state; the period's usage events equal what billing counted unless `eventsGbHours` says otherwise. */
const STATES = {
	/** Northwind Labs: seats, a used-up free credit, then extra usage under an absolute cap. */
	northwind: { billing: NORTHWIND_BILLING },
	/** Birchwood Health, on a trial: seats only, extra usage off, under its allowance. */
	trial: {
		billing: { seats: 9, perSeatGbHours: 500, usedGbHours: 3100, extra: "off" },
	},
	/** Acme Robotics: a bought pack not drawn yet, and extra usage under an absolute cap. */
	prepaid: {
		billing: {
			seats: 38,
			perSeatGbHours: 1000,
			usedGbHours: 21400,
			boughtGbHours: 5000,
			extra: { capGbHours: 129000 },
		},
	},
	/** Seats only with extra usage off, and the allowance used up. */
	limitReached: {
		billing: { seats: 9, perSeatGbHours: 500, usedGbHours: 4500, extra: "off" },
	},
	/** Northwind's own cap in the design, 300% of its allowance: the router cannot give its amount. */
	percentCap: {
		billing: { ...NORTHWIND_BILLING, extra: { percent: 300 } },
	},
	/** Northwind, from a billing value cached before seats, credits and the cap were read. */
	notRead: { billing: { ...NORTHWIND_BILLING, cached: true } },
	/** Northwind, with usage events billing has not counted yet. */
	unbilled: { billing: NORTHWIND_BILLING, eventsGbHours: 15800 },
} satisfies Record<string, { billing: Billing; eventsGbHours?: number }>;

export type BillingState = keyof typeof STATES;

const eventsOf = (state: BillingState) => {
	const entry: { billing: Billing; eventsGbHours?: number } = STATES[state];
	return entry.eventsGbHours ?? entry.billing.usedGbHours;
};

const fleetIn = (state: BillingState, back: number, seeds = NORTHWIND_SEEDS) =>
	fleet(seeds, eventsOf(state) * (PERIOD_SHARE[back] ?? 0), periodRange(back));

/** The router's period list for a state, newest first; the earlier periods are closed. A member gets no allowance and their own metrics. */
function periodList(state: BillingState, member = false): CloudPeriods {
	const current = billingPeriod(STATES[state].billing);
	const items: CloudPeriod[] = PERIOD_SHARE.map((_, back) => {
		const range = periodRange(back);
		const rows = fleetIn(state, back).rows;
		return {
			id: day(range.from),
			start: range.from,
			end: range.to,
			closed: back > 0,
			allowance: back === 0 && !member ? current.allowance : null,
			unavailable: member
				? [{ field: "allowance", reason: "owners_and_admins_only" }]
				: back === 0
					? current.unavailable
					: [{ field: "allowance", reason: "closed_period" }],
			metrics: total(member ? rows.filter(isMember) : rows),
		};
	});
	return { items, nextCursor: null };
}

const noop = () => undefined;

export const query = <T>(
	data: T | undefined,
	isError = false,
): CloudQuery<T> => ({ data, isError, refetch: noop });

export const pagesQuery = <T>(
	pages: T[] | undefined,
	isError = false,
): CloudPages<T> => ({
	data: pages && { pages },
	isError,
	refetch: noop,
	hasNextPage: false,
	isFetchingNextPage: false,
	fetchNextPage: async () => undefined,
});

const isMember = (row: Row) => workspaceRef(row)?.owner?.id === SAM.id;

function overviewQueries({ rows, boots }: Fleet, range: Range) {
	const fleetOf = { rows, boots };
	return {
		byDay: query(byDay(fleetOf, range)),
		byPerson: query(byPerson(fleetOf, range)),
		workspaces: query(
			usage(rows.slice(0, TOP_WORKSPACES), rows, range, rows.length),
		),
	};
}

/** The overview's arguments in a billing state: `back` periods ago, as a member, or with long names. */
export function overviewArgs(
	state: BillingState,
	{
		back = 0,
		member = false,
		long = false,
	}: { back?: number; member?: boolean; long?: boolean } = {},
) {
	const list = periodList(state, member);
	const all = fleetIn(state, back, long ? LONG_SEEDS : NORTHWIND_SEEDS);
	const shown = member
		? {
				rows: all.rows.filter(isMember),
				boots: all.boots.filter((boot) => boot.user?.id === SAM.id),
			}
		: all;
	return {
		periods: query(list),
		period: list.items[back],
		...overviewQueries(shown, periodRange(back)),
	};
}

/** An organization with no billing periods: the last 30 days, priced at the list rate. */
export function noPeriodsArgs() {
	return {
		periods: query<CloudPeriods>({ items: [], nextCursor: null }),
		period: undefined,
		...overviewQueries(
			fleet(NORTHWIND_SEEDS, 3100, LAST_30_DAYS),
			LAST_30_DAYS,
		),
	};
}

/** The allowance card's arguments in a billing state. */
export function cardArgs(state: BillingState, back = 0) {
	const args = overviewArgs(state, { back });
	return {
		total: (args.byDay.data as Usage).total,
		period: args.period,
		allowance: priced(args.period?.allowance ?? null),
	};
}

export function lastThirtyDaysCardArgs() {
	const args = noPeriodsArgs();
	return {
		total: (args.byDay.data as Usage).total,
		period: undefined,
		allowance: null,
	};
}

const NOW = fleetIn("northwind", 0);
const LONG_NOW = fleetIn("northwind", 0, LONG_SEEDS);
export const workspacesPeriods = periodList("northwind");

/** The Workspaces page's cursor pages, `perPage` at a time. */
export function workspacePages(rows: Row[] = NOW.rows, perPage = 15): Usage[] {
	const pages: Usage[] = [];
	for (let start = 0; start === 0 || start < rows.length; start += perPage) {
		pages.push({
			...usage(rows.slice(start, start + perPage), rows, CURRENT, rows.length),
			nextCursor:
				start + perPage < rows.length ? `cursor-${start + perPage}` : null,
		});
	}
	return pages;
}

const hasStatus = (status: WorkspaceRef["status"]) => (row: Row) =>
	workspaceRef(row)?.status === status;

export const rowsFixtures = {
	all: NOW.rows,
	member: NOW.rows.filter(isMember),
	long: LONG_NOW.rows,
	asleepByName: NOW.rows
		.filter(hasStatus("asleep"))
		.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")),
	priya: NOW.rows.filter((row) => workspaceRef(row)?.owner?.id === PRIYA.id),
	sync: NOW.rows.filter((row) => row.label?.includes("sync")),
};

export const workspacesByPerson = byPerson(NOW, CURRENT);

/** One workspace's page arguments: its row and boots in the open period. */
export function workspaceArgs(which: WorkspaceRef["status"] | "long") {
	const source = which === "long" ? LONG_NOW : NOW;
	const row = source.rows.find(
		which === "long" ? (item) => item.key === "ws-1" : hasStatus(which),
	) as Row;
	const one = query(usage([row], [row], CURRENT));
	return {
		periods: query(workspacesPeriods),
		period: workspacesPeriods.items[0],
		workspace: one,
		allTime: one,
		boots: pagesQuery([
			{
				range: CURRENT,
				items: source.boots.filter((boot) => boot.workspace?.id === row.key),
				nextCursor: null,
			},
		]),
	};
}

export const emptyUsage = usage([], [], CURRENT);
