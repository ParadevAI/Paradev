import { type MachineSize, machineSpec } from "@superset/shared/billing";
import type {
	CloudBoot,
	CloudPages,
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	PersonRef,
	WorkspaceRef,
} from "../types";
import type {
	PricedAllowance,
	PricedBoot,
	PricedBoots,
	PricedRow,
	PricedUsage,
} from "../utils/priced";

/** Story data in the router's output shapes. Seeded, so every build draws the same pages. */

const RATE = 0.06;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_START = new Date("2026-10-27T00:00:00Z");
const PERIOD_END = new Date("2026-11-27T00:00:00Z");
const TODAY = "2026-11-18";

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
].map((name, i) => ({
	id: `00000000-0000-4000-8000-00000000000${i + 1}`,
	name,
	email: `${name.split(" ")[0]?.toLowerCase()}@example.com`,
}));
const [PRIYA, INES, SAM, THEO] = PEOPLE as [
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

const metrics = (
	gbHours: number,
	hours: number,
	boots: number,
	workspaces = 1,
) => ({
	workspaces,
	boots,
	failedBoots: 0,
	hours,
	gbHours,
	usageUsd: gbHours * RATE,
});

function workspaceRows(count: number, names?: string[]): PricedRow[] {
	const rows: PricedRow[] = Array.from({ length: count }, (_, i) => {
		const size = pick(SIZES);
		const owner = i === 0 ? SAM : pick([PRIYA, PRIYA, INES, SAM, THEO]);
		const status = i === 1 || i === count - 2 ? "failed" : pick(STATUSES);
		const hours = 4 + random() * 24;
		const ref: WorkspaceRef = {
			id: `ws-${i + 1}`,
			name: names?.[i] ?? `${pick(WORDS)}-${pick(WORDS)}-${pick(WORDS)}`,
			status,
			size,
			owner,
			failure:
				status === "failed"
					? { reason: "snapshot_expired", at: new Date("2026-11-14T23:47:00Z") }
					: null,
			lastBoot: {
				endReason: status === "asleep" && i % 5 === 2 ? "usage_limit" : "idle",
				stoppedAt: status === "awake" ? null : new Date("2026-11-17T18:00:00Z"),
			},
		};
		const gbHours = hours * machineSpec(size).memoryGb;
		return {
			key: ref.id,
			label: ref.name,
			ref,
			...metrics(gbHours, hours, 2 + (i % 9)),
		};
	});
	return rows.sort((a, b) => b.gbHours - a.gbHours);
}

const ALL_ROWS = workspaceRows(33);
const LONG_ROWS = workspaceRows(12, [
	"migrate-the-whole-billing-pipeline-to-the-new-event-store-without-downtime",
	"fix-flaky",
	...Array.from(
		{ length: 10 },
		(_, i) => `refactor-onboarding-checklist-and-invite-flow-part-${i + 1}`,
	),
]).map((row) =>
	row.ref && "status" in row.ref && row.ref.owner?.id === PRIYA.id
		? {
				...row,
				ref: {
					...row.ref,
					owner: { ...PRIYA, name: "Priya Natarajan-Venkataraman Subramanian" },
				},
			}
		: row,
);

const total = (rows: PricedRow[]) => {
	const sum = (pick: (row: PricedRow) => number) =>
		rows.reduce((value, row) => value + pick(row), 0);
	return {
		workspaces: rows.length,
		boots: sum((row) => row.boots),
		failedBoots: 0,
		hours: sum((row) => row.hours),
		gbHours: sum((row) => row.gbHours),
		usageUsd: sum((row) => row.usageUsd),
	};
};

const range = { from: PERIOD_START, to: PERIOD_END };

function usage(
	items: PricedRow[],
	rows: PricedRow[],
	rowCount = items.length,
): PricedUsage {
	return { range, items, total: total(rows), rowCount, nextCursor: null };
}

/** Removes dollars, as the router does with no rate. */
export const withoutRate = (page: PricedUsage): CloudUsage => ({
	...page,
	items: page.items.map((item) => ({ ...item, usageUsd: null })),
	total: { ...page.total, usageUsd: null },
});

function byDay(rows: PricedRow[]): PricedUsage {
	const days: string[] = [];
	for (
		let day = PERIOD_START.getTime();
		day <= Date.parse(`${TODAY}T00:00:00Z`);
		day += DAY_MS
	) {
		days.push(new Date(day).toISOString().slice(0, 10));
	}
	const sum = total(rows).gbHours;
	const weights = days.map(
		(_, i) => (i % 7 === 5 || i % 7 === 6 ? 0.4 : 1) * (0.5 + random()),
	);
	const weightSum = weights.reduce((a, b) => a + b, 0);
	const items = days.map((day, i) => {
		const gbHours = (sum * (weights[i] ?? 0)) / weightSum;
		return {
			key: day,
			label: day,
			ref: null,
			...metrics(gbHours, gbHours / 8, 3),
		};
	});
	return usage(items, rows);
}

function byPerson(rows: PricedRow[]): PricedUsage {
	const items = PEOPLE.map((person) => {
		const own = rows.filter(
			(row) =>
				row.ref && "status" in row.ref && row.ref.owner?.id === person.id,
		);
		const t = total(own);
		return {
			key: person.id,
			label: person.name,
			ref: person,
			...t,
			workspaces: own.length,
		};
	}).sort((a, b) => b.gbHours - a.gbHours);
	return usage(items, rows);
}

const memberRows = ALL_ROWS.filter(
	(row) => row.ref && "status" in row.ref && row.ref.owner?.id === SAM.id,
);

export const usageFixtures = {
	byDay: byDay(ALL_ROWS),
	byPerson: byPerson(ALL_ROWS),
	top: usage(ALL_ROWS.slice(0, 8), ALL_ROWS, ALL_ROWS.length),
	memberByDay: byDay(memberRows),
	memberTop: usage(memberRows.slice(0, 8), memberRows),
	longByDay: byDay(LONG_ROWS),
	longByPerson: byPerson(LONG_ROWS),
	longTop: usage(LONG_ROWS.slice(0, 8), LONG_ROWS),
	empty: usage([], []),
};

/** The Workspaces page's cursor pages, `rows` at a time. */
export function workspacePages(
	rows: PricedRow[] = ALL_ROWS,
	perPage = 15,
): PricedUsage[] {
	const pages: PricedUsage[] = [];
	for (let start = 0; start === 0 || start < rows.length; start += perPage) {
		pages.push({
			...usage(rows.slice(start, start + perPage), rows, rows.length),
			nextCursor:
				start + perPage < rows.length ? `cursor-${start + perPage}` : null,
		});
	}
	return pages;
}

export const rowsFixtures = {
	all: ALL_ROWS,
	member: memberRows,
	long: LONG_ROWS,
	asleepByName: ALL_ROWS.filter(
		(row) => row.ref && "status" in row.ref && row.ref.status === "asleep",
	).sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")),
	priya: ALL_ROWS.filter(
		(row) => row.ref && "status" in row.ref && row.ref.owner?.id === PRIYA.id,
	),
	sync: ALL_ROWS.filter((row) => row.label?.includes("sync")),
};

type Allowance = PricedAllowance;

const gbh = (gbHours: number) => ({ gbHours, usd: gbHours * RATE });
const credit = (used: number, totalGbHours: number) => ({
	usedGbHours: used,
	totalGbHours,
	usedUsd: used * RATE,
	totalUsd: totalGbHours * RATE,
});

function allowance(
	over: Partial<Allowance> & { includedGbHours: number; usedGbHours: number },
): Allowance {
	return {
		overageGbHours: 0,
		prepaidRemainingGbHours: 0,
		resetsAt: PERIOD_END,
		usedUsd: over.usedGbHours * RATE,
		includedUsd: over.includedGbHours * RATE,
		overageUsd: (over.overageGbHours ?? 0) * RATE,
		seats: 14,
		bought: null,
		freeCredits: null,
		extraUsageLimit: { gbHours: 0, usd: 0 },
		limitReached: false,
		...over,
	};
}

const used = total(ALL_ROWS).gbHours;

/** The card's billing side, one per state; every state but `limitReached` agrees with the usage events. */
export const allowanceFixtures = {
	seatsOnly: allowance({ includedGbHours: 7000, usedGbHours: used }),
	freeCredits: allowance({
		includedGbHours: used - 500,
		usedGbHours: used - 500,
		freeCredits: credit(500, 2000),
		seats: 12,
	}),
	over: allowance({
		includedGbHours: 3500,
		usedGbHours: 3500,
		overageGbHours: used - 4000,
		freeCredits: credit(500, 500),
		extraUsageLimit: { ...gbh(4000) },
		seats: 7,
	}),
	bought: allowance({
		includedGbHours: 4000,
		usedGbHours: 4000,
		prepaidRemainingGbHours: 5000 - (used - 4000),
		bought: credit(used - 4000, 5000),
		seats: 8,
	}),
	limitReached: allowance({
		includedGbHours: used - 560,
		usedGbHours: used - 560,
		limitReached: true,
		seats: 10,
	}),
	percentCap: allowance({
		includedGbHours: 4000,
		usedGbHours: 4000,
		overageGbHours: used - 4000,
		extraUsageLimit: null,
		limitReached: null,
		seats: 8,
	}),
	notRead: allowance({
		includedGbHours: 7000,
		usedGbHours: used,
		seats: null,
		extraUsageLimit: null,
		limitReached: null,
	}),
};

const NOT_READ = (
	["seats", "bought", "freeCredits", "extraUsageLimit", "limitReached"] as const
).map((field) => ({
	field,
	reason: "not_read" as const,
}));

export const unavailableFixtures = {
	none: [],
	notRead: NOT_READ,
	percentCap: [
		{
			field: "extraUsageLimit" as const,
			reason: "percent_of_allowance" as const,
		},
		{ field: "limitReached" as const, reason: "not_tracked" as const },
	],
};

/** Newest first, as the router lists them. */
export function periods(
	current: Pick<CloudPeriod, "allowance" | "unavailable">,
): CloudPeriods {
	const items: CloudPeriod[] = Array.from({ length: 6 }, (_, i) => {
		const start = new Date(Date.UTC(2026, 9 - i, 27));
		const end = new Date(Date.UTC(2026, 10 - i, 27));
		return {
			id: start.toISOString().slice(0, 10),
			start,
			end,
			closed: i > 0,
			allowance: i === 0 ? current.allowance : null,
			unavailable:
				i === 0
					? current.unavailable
					: [{ field: "allowance", reason: "closed_period" }],
			metrics: total(ALL_ROWS),
		};
	});
	return { items, nextCursor: null };
}

export function boots(workspace: WorkspaceRef, failed = false): PricedBoots {
	const memoryGb = machineSpec(workspace.size).memoryGb;
	const vcpus = machineSpec(workspace.size).vcpus;
	const boot = (
		id: string,
		startedAt: string,
		minutes: number,
		endReason: CloudBoot["endReason"],
		open = false,
	): PricedBoot => ({
		id,
		sessionId: null,
		workspace: { id: workspace.id, name: workspace.name },
		user: workspace.owner,
		startedAt: new Date(startedAt),
		stoppedAt: open ? null : new Date(Date.parse(startedAt) + minutes * 60_000),
		minutes,
		size: workspace.size,
		memoryGb,
		vcpus,
		endReason,
		gbHours: (minutes / 60) * memoryGb,
		usageUsd: (minutes / 60) * memoryGb * RATE,
	});
	const items = failed
		? [
				boot("b1", "2026-11-14T23:46:00Z", 1, "failed"),
				boot("b2", "2026-11-10T05:03:00Z", 333, "usage_limit"),
				boot("b3", "2026-11-02T22:19:00Z", 305, "user"),
			]
		: [
				boot(
					"b1",
					"2026-11-18T11:02:00Z",
					240,
					null,
					workspace.status === "awake",
				),
				boot("b2", "2026-11-17T15:22:00Z", 140, "user"),
				boot("b3", "2026-11-11T16:51:00Z", 254, "restarted"),
				boot("b4", "2026-11-06T01:31:00Z", 399, "idle"),
				boot("b5", "2026-10-27T13:46:00Z", 32, "usage_limit"),
			];
	return { range, items, nextCursor: null };
}

export const workspaceRefs = {
	asleep: ALL_ROWS.map((row) => row.ref).find(
		(ref): ref is WorkspaceRef =>
			!!ref && "status" in ref && ref.status === "asleep",
	) as WorkspaceRef,
	failed: ALL_ROWS.map((row) => row.ref).find(
		(ref): ref is WorkspaceRef =>
			!!ref && "status" in ref && ref.status === "failed",
	) as WorkspaceRef,
	long: LONG_ROWS[0]?.ref as WorkspaceRef,
};

export const rowOf = (ref: WorkspaceRef) =>
	[...ALL_ROWS, ...LONG_ROWS].find((row) => row.key === ref.id) as PricedRow;

const noop = () => undefined;

export const query = <T>(
	data: T | undefined,
	isError = false,
): CloudQuery<T> => ({
	data,
	isError,
	refetch: noop,
});

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
