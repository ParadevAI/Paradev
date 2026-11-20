import { type MachineSize, machineSpec } from "@superset/shared/billing";
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
import { billingDate, billingDays } from "../utils/billingDay";
import { type Priced, priced } from "../utils/priced";
import { usageRange } from "../utils/usageRange";

/**
 * Story data in the router's output shapes, for states the router can return. Each allowance
 * goes through the billing reader and the router's own mapping, from an Autumn balance built
 * here. Seeded and on a fixed clock, so every build draws the same pages.
 */

const RATE = 0.06;
const MINUTES = 60;
/** The stories' clock, so captures do not change from day to day. */
export const STORY_NOW = new Date("2026-11-18T22:00:00Z");
export const STORY_TODAY = billingDate(STORY_NOW);
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
	image: null,
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
	number: number;
}

function workspaceSeeds(count: number, names?: string[]): Seed[] {
	return Array.from({ length: count }, (_, i) => {
		const status = i === 1 || i === count - 2 ? "failed" : pick(STATUSES);
		const ref: WorkspaceRef = {
			id: `ws-${i + 1}`,
			name: names?.[i] ?? `${pick(WORDS)}-${pick(WORDS)}-${pick(WORDS)}`,
			status,
			deleted: false,
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
			number: i,
		};
	});
}

/** How long a boot that could not start ran, as in the design. */
const FAILED_BOOT_MINUTES = 0.8;

/**
 * A workspace's boots in a range: `gbHours` over boots of about `BOOT_HOURS` each, of mixed
 * lengths, newest first. The newest is open when the workspace is awake, a failed start that
 * billed nothing when it failed, and stopped at the usage limit when the organization reached it.
 */
function bootsOf(
	seed: Seed,
	gbHours: number,
	range: Range,
	atLimit: boolean,
): Boot[] {
	const { ref } = seed;
	const { memoryGb, vcpus } = machineSpec(ref.size);
	const failed = ref.status === "failed";
	const count = Math.min(
		MAX_BOOTS,
		Math.max(1, Math.round(gbHours / memoryGb / BOOT_HOURS)),
	);
	const lengths = seeded(seed.number + 1);
	const weights = Array.from({ length: count }, (_, i) =>
		failed && i === 0 ? 0 : 0.25 + 1.75 * lengths(),
	);
	const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
	const end = Math.min(range.to.getTime(), STORY_NOW.getTime());
	const span = end - range.from.getTime();
	return weights.map((weight, i) => {
		const bootGbHours = (gbHours * weight) / weightSum;
		const minutes =
			failed && i === 0
				? FAILED_BOOT_MINUTES
				: (bootGbHours * MINUTES) / memoryGb;
		const open = i === 0 && ref.status === "awake" && !atLimit;
		const startedAt = new Date(
			end - ((i + 0.5) / count) * span - (open ? 0 : minutes * MINUTES * 1000),
		);
		const endReason: CloudBoot["endReason"] = open
			? null
			: i === 0 && failed
				? "failed"
				: i === 0 && atLimit && ref.status === "awake"
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
			gbHours: bootGbHours,
			usageUsd: round2(bootGbHours * RATE),
		};
	});
}

/** A group's metrics, priced from its GB-hours at one rate as the router prices a row. */
function metricsOf(boots: Boot[]) {
	const gbHours = boots.reduce((sum, boot) => sum + boot.gbHours, 0);
	return {
		workspaces: new Set(boots.map((boot) => boot.workspace?.id)).size,
		boots: boots.length,
		failedBoots: boots.filter((boot) => boot.endReason === "failed").length,
		hours: boots.reduce((sum, boot) => sum + boot.minutes / MINUTES, 0),
		gbHours,
		usageUsd: round2(gbHours * RATE),
	};
}

interface Fleet {
	rows: Row[];
	boots: Boot[];
}

/** The fleet's usage rows and boots for a range, holding `gbHours` in all. `atLimit`: the organization reached its usage limit, so no workspace is awake. */
function fleet(
	seeds: Seed[],
	gbHours: number,
	range: Range,
	atLimit = false,
): Fleet {
	if (gbHours <= 0) return { rows: [], boots: [] };
	const weights = seeds.reduce((sum, seed) => sum + seed.weight, 0);
	const boots: Boot[] = [];
	const rows = seeds.map((seed) => {
		const own = bootsOf(
			seed,
			(gbHours * seed.weight) / weights,
			range,
			atLimit,
		);
		boots.push(...own);
		const latest = own[0];
		const ref: WorkspaceRef = {
			...seed.ref,
			status:
				atLimit && seed.ref.status === "awake" ? "asleep" : seed.ref.status,
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
		usageUsd: round2(sum((row) => row.gbHours) * RATE),
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

/** One row per billing day of the range up to today, as the router groups by `billingDay`: no workspaces count. */
function byDay({ rows, boots }: Fleet, range: Range): Usage {
	const days = new Map<string, Boot[]>();
	for (const key of billingDays(range)) {
		if (key <= STORY_TODAY) days.set(key, []);
	}
	for (const boot of boots) days.get(billingDate(boot.startedAt))?.push(boot);
	const items = [...days].map(([key, list]) => ({
		key,
		label: key,
		ref: null,
		...metricsOf(list),
		workspaces: null,
	}));
	const page = usage(items, rows, range);
	return { ...page, total: { ...page.total, workspaces: null } };
}

/** `groupBy: "user"`, with each person's days. */
function byPerson({ rows, boots }: Fleet, range: Range): Usage {
	const daysOf = (personId: string) => {
		const days = new Map<string, Boot[]>();
		for (const boot of boots)
			if (boot.user?.id === personId) {
				const key = day(boot.startedAt);
				days.set(key, [...(days.get(key) ?? []), boot]);
			}
		return [...days].sort().map(([key, list]) => {
			const { gbHours, usageUsd } = metricsOf(list);
			return { day: key, gbHours, usageUsd };
		});
	};
	const items = PEOPLE.map((person) => ({
		key: person.id,
		label: person.name,
		ref: person,
		...total(rows.filter((row) => workspaceRef(row)?.owner?.id === person.id)),
		days: daysOf(person.id),
	}))
		.filter((item) => item.gbHours > 0)
		.sort((a, b) => b.gbHours - a.gbHours);
	return usage(items, rows, range);
}

const TOP_WORKSPACES = 8;

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
const lastDays = usageRange(undefined, STORY_NOW);
/** The range with no billing periods, as the page asks for it. */
const LAST_30_DAYS: Range = {
	from: new Date(lastDays.from as string),
	to: new Date(lastDays.to as string),
};

const PERIOD_END = new Date("2026-11-27T00:00:00Z");

/** The open period of each billing state, as the router returns it; `eventsGbHours` can run past what billing counted. */
const STATES = {
	northwind: {
		eventsGbHours: 15200,
		allowance: {
			includedGbHours: 7000,
			usedGbHours: 13200,
			overageGbHours: 6200,
			prepaidRemainingGbHours: 0,
			usedUsd: 792,
			includedUsd: 420,
			overageUsd: 372,
			seats: 14,
			bought: null,
			freeCredits: {
				usedGbHours: 2000,
				totalGbHours: 2000,
				usedUsd: 120,
				totalUsd: 120,
			},
			extraUsageLimit: { gbHours: 27000, usd: 1620 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	trial: {
		eventsGbHours: 3100,
		allowance: {
			includedGbHours: 4500,
			usedGbHours: 3100,
			overageGbHours: 0,
			prepaidRemainingGbHours: 0,
			usedUsd: 186,
			includedUsd: 270,
			overageUsd: 0,
			seats: 9,
			bought: null,
			freeCredits: null,
			extraUsageLimit: { gbHours: 0, usd: 0 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	prepaid: {
		eventsGbHours: 21400,
		allowance: {
			includedGbHours: 38000,
			usedGbHours: 21400,
			overageGbHours: 0,
			prepaidRemainingGbHours: 5000,
			usedUsd: 1284,
			includedUsd: 2280,
			overageUsd: 0,
			seats: 38,
			bought: { usedGbHours: 0, totalGbHours: 5000, usedUsd: 0, totalUsd: 300 },
			freeCredits: null,
			extraUsageLimit: { gbHours: 129000, usd: 7740 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	limitReached: {
		eventsGbHours: 4590,
		allowance: {
			includedGbHours: 4500,
			usedGbHours: 4500,
			overageGbHours: 0,
			prepaidRemainingGbHours: 0,
			usedUsd: 270,
			includedUsd: 270,
			overageUsd: 0,
			seats: 9,
			bought: null,
			freeCredits: null,
			extraUsageLimit: { gbHours: 0, usd: 0 },
			limitReached: true,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	toppedUp: {
		eventsGbHours: 4590,
		allowance: {
			includedGbHours: 4500,
			usedGbHours: 4500,
			overageGbHours: 0,
			prepaidRemainingGbHours: 4410,
			usedUsd: 270,
			includedUsd: 270,
			overageUsd: 0,
			seats: 9,
			bought: {
				usedGbHours: 90,
				totalGbHours: 4500,
				usedUsd: 5.4,
				totalUsd: 270,
			},
			freeCredits: null,
			extraUsageLimit: { gbHours: 0, usd: 0 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	freeCredit: {
		eventsGbHours: 4800,
		allowance: {
			includedGbHours: 4500,
			usedGbHours: 4500,
			overageGbHours: 0,
			prepaidRemainingGbHours: 700,
			usedUsd: 270,
			includedUsd: 270,
			overageUsd: 0,
			seats: 9,
			bought: null,
			freeCredits: {
				usedGbHours: 300,
				totalGbHours: 1000,
				usedUsd: 18,
				totalUsd: 60,
			},
			extraUsageLimit: { gbHours: 0, usd: 0 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	contractOver: {
		eventsGbHours: 9000,
		allowance: {
			includedGbHours: 7000,
			usedGbHours: 9000,
			overageGbHours: 2000,
			prepaidRemainingGbHours: 0,
			usedUsd: 540,
			includedUsd: 420,
			overageUsd: 120,
			seats: 14,
			bought: null,
			freeCredits: null,
			extraUsageLimit: { gbHours: 1000000, usd: 60000 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	notRead: {
		eventsGbHours: 15200,
		allowance: {
			includedGbHours: 7000,
			usedGbHours: 13200,
			overageGbHours: 6200,
			prepaidRemainingGbHours: 0,
			usedUsd: 792,
			includedUsd: 420,
			overageUsd: 372,
			seats: null,
			bought: null,
			freeCredits: null,
			extraUsageLimit: null,
			limitReached: null,
			resetsAt: PERIOD_END,
		},
		unavailable: [
			{ field: "seats", reason: "not_read" },
			{ field: "bought", reason: "not_read" },
			{ field: "freeCredits", reason: "not_read" },
			{ field: "extraUsageLimit", reason: "not_read" },
			{ field: "limitReached", reason: "not_read" },
		],
	},
	unbilled: {
		eventsGbHours: 15800,
		allowance: {
			includedGbHours: 7000,
			usedGbHours: 13200,
			overageGbHours: 6200,
			prepaidRemainingGbHours: 0,
			usedUsd: 792,
			includedUsd: 420,
			overageUsd: 372,
			seats: 14,
			bought: null,
			freeCredits: {
				usedGbHours: 2000,
				totalGbHours: 2000,
				usedUsd: 120,
				totalUsd: 120,
			},
			extraUsageLimit: { gbHours: 27000, usd: 1620 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	reattached: {
		eventsGbHours: 17159.5,
		allowance: {
			includedGbHours: 6000,
			usedGbHours: 6000,
			overageGbHours: 0,
			prepaidRemainingGbHours: 3847.85,
			usedUsd: 360,
			includedUsd: 360,
			overageUsd: 0,
			seats: 5,
			bought: {
				usedGbHours: 3178.08,
				totalGbHours: 7025.929999999999,
				usedUsd: 190.68,
				totalUsd: 421.56,
			},
			freeCredits: null,
			extraUsageLimit: { gbHours: 0, usd: 0 },
			limitReached: false,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
	raisedByHand: {
		eventsGbHours: 3000,
		allowance: {
			includedGbHours: 833.33,
			usedGbHours: -850.98,
			overageGbHours: 0,
			prepaidRemainingGbHours: 0,
			usedUsd: -51.06,
			includedUsd: 50,
			overageUsd: 0,
			seats: 1,
			bought: null,
			freeCredits: null,
			extraUsageLimit: null,
			limitReached: null,
			resetsAt: PERIOD_END,
		},
		unavailable: [
			{ field: "extraUsageLimit", reason: "percent_of_allowance" },
			{ field: "limitReached", reason: "not_tracked" },
		],
	},
	overageOffBilled: {
		eventsGbHours: 2732.54,
		allowance: {
			includedGbHours: 1200,
			usedGbHours: 2732.54,
			overageGbHours: 1532.54,
			prepaidRemainingGbHours: 0,
			usedUsd: 163.95,
			includedUsd: 72,
			overageUsd: 91.95,
			seats: 1,
			bought: null,
			freeCredits: null,
			extraUsageLimit: { gbHours: 0, usd: 0 },
			limitReached: true,
			resetsAt: PERIOD_END,
		},
		unavailable: [],
	},
} satisfies Record<
	string,
	{
		eventsGbHours: number;
		allowance: NonNullable<CloudPeriod["allowance"]>;
		unavailable: CloudPeriod["unavailable"];
	}
>;

export type BillingState = keyof typeof STATES;
export const BILLING_STATES = Object.keys(STATES) as BillingState[];

const eventsOf = (state: BillingState) => STATES[state].eventsGbHours;

/** A state's fleet `back` periods ago; only the open period of the limit-reached state is at its limit. */
const fleetIn = (state: BillingState, back: number, seeds = NORTHWIND_SEEDS) =>
	fleet(
		seeds,
		eventsOf(state) * (PERIOD_SHARE[back] ?? 0),
		periodRange(back),
		state === "limitReached" && back === 0,
	);

/** The router's period list for a state, newest first; the earlier periods are closed. A member gets no allowance and their own metrics. */
function periodList(state: BillingState, member = false): CloudPeriods {
	const current = STATES[state];
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
	return { items, nextCursor: null, ratePerGbHour: RATE };
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
		periods: query<CloudPeriods>({
			items: [],
			nextCursor: null,
			ratePerGbHour: RATE,
		}),
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
	const { total } = args.byDay.data as Usage;
	const allowance = priced(args.period?.allowance ?? null);
	return {
		metered: { gbHours: total.gbHours, usd: total.usageUsd },
		ratePerGbHour: RATE,
		allowance,
		unavailable: args.period?.unavailable ?? [],
		isPeriod: true,
		seats: allowance?.seats ?? null,
	};
}

/** Under a cent of usage in the open period: a few minutes on a small box. */
export function tinyUsageCardArgs() {
	const args = cardArgs("trial");
	if (!args.allowance) throw new Error("the trial state has an allowance");
	const gbHours = 0.07;
	return {
		...args,
		metered: { gbHours, usd: gbHours * RATE },
		allowance: {
			...args.allowance,
			usedGbHours: gbHours,
			usedUsd: gbHours * RATE,
			overageGbHours: 0,
			overageUsd: 0,
		},
	};
}

export function lastThirtyDaysCardArgs() {
	const { total } = noPeriodsArgs().byDay.data as Usage;
	return {
		metered: { gbHours: total.gbHours, usd: total.usageUsd },
		ratePerGbHour: RATE,
		allowance: null,
		unavailable: [],
		isPeriod: false,
		seats: null,
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
		workspaceId: row.key ?? "",
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
