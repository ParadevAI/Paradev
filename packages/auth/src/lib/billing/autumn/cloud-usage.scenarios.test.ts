import { describe, expect, test } from "bun:test";
import { cloudUsageDisplay } from "@superset/shared/cloud-usage-display";
import { allowanceOf, cloudUsageFromBalances } from "./cloud-usage";
import SANDBOX from "./cloud-usage.sandbox.json";

/**
 * The cloud usage card across billing periods: the specification. Steps marked `sandbox` start from
 * a balance Autumn's sandbox returned for the meter's own calls (cloud-usage.sandbox.json). The
 * other steps use a small ledger that follows what the sandbox did: usage draws the seats' amount,
 * then credits, then the priced row while overage is allowed, and past that is dropped; a reset
 * invoices the priced row and starts the monthly rows at 0; credits carry over.
 */

const PER_SEAT = 72_000;

interface Prices {
	usageBased: { amount: number; billingUnits: number };
	prepaid: { amount: number; billingUnits: number };
}
const CATALOG: Prices = {
	usageBased: { amount: 1, billingUnits: 1000 },
	prepaid: { amount: 0.06, billingUnits: 60 },
};
/** A Team version priced for one customer: $0.03 a GB-hour past the allowance, $0.04 bought. */
const CUSTOM: Prices = {
	usageBased: { amount: 0.5, billingUnits: 1000 },
	prepaid: { amount: 0.04, billingUnits: 60 },
};

type Plan = "team" | "pro" | "enterprise";
type Kind = "seats" | "priced" | "free" | "bought";
interface Row {
	kind: Kind;
	included: number;
	prepaid: number;
	usage: number;
}
type Balance = Parameters<typeof cloudUsageFromBalances>[0][string];
type Controls = NonNullable<Parameters<typeof cloudUsageFromBalances>[1]>;
type Snapshot = Exclude<keyof typeof SANDBOX, "_source">;

const kindOf = (row: NonNullable<Balance["breakdown"]>[number]): Kind =>
	row.price?.billingMethod === "usage_based"
		? "priced"
		: row.reset?.interval === "one_off"
			? row.price
				? "bought"
				: "free"
			: "seats";

class Ledger {
	rows: Row[];
	overage: boolean;
	/** This period's usage events: what the meter sent, before billing drops any of it. */
	metered = 0;
	constructor(
		public plan: Plan,
		seats = 1,
		public prices = CATALOG,
	) {
		this.overage = plan !== "team";
		this.rows =
			plan === "team"
				? [
						{ kind: "seats", included: seats * PER_SEAT, prepaid: 0, usage: 0 },
						{ kind: "priced", included: 0, prepaid: 0, usage: 0 },
					]
				: [{ kind: "priced", included: 50_000, prepaid: 0, usage: 0 }];
	}
	load(name: Snapshot, metered: number) {
		const { plan, overage, balance } = SANDBOX[name];
		this.plan = plan as Plan;
		this.overage = overage;
		this.metered = metered;
		const { breakdown } = balance as unknown as Balance;
		if (!breakdown) throw new Error(`${name} has no breakdown`);
		this.rows = breakdown.map((row) => ({
			kind: kindOf(row),
			included: row.includedGrant,
			prepaid: row.prepaidGrant,
			usage: row.usage,
		}));
	}
	private room(row: Row): number {
		const held = Math.max(0, row.included + row.prepaid - row.usage);
		if (row.kind !== "priced" || !this.overage) return held;
		const cap =
			this.plan === "pro" ? 3 * row.included : Number.POSITIVE_INFINITY;
		return held + cap - Math.max(0, row.usage - row.included);
	}
	track(gbMinutes: number) {
		this.metered += gbMinutes;
		const rank = { seats: 0, free: 1, bought: 2, priced: 3 };
		let left = gbMinutes;
		for (const row of [...this.rows].sort(
			(a, b) => rank[a.kind] - rank[b.kind],
		)) {
			const drawn = Math.min(left, this.room(row));
			row.usage += drawn;
			left -= drawn;
		}
	}
	credit(kind: "free" | "bought", gbMinutes: number) {
		const row = this.rows.find((item) => item.kind === kind);
		const field = kind === "free" ? "included" : "prepaid";
		if (row) row[field] += gbMinutes;
		else
			this.rows.push({
				kind,
				included: 0,
				prepaid: 0,
				usage: 0,
				[field]: gbMinutes,
			});
	}
	seats(seats: number) {
		const row = this.rows.find((item) => item.kind === "seats") as Row;
		row.included = seats * PER_SEAT;
		row.usage = Math.min(row.usage, row.included);
	}
	upgrade(perSeat: number) {
		const row = this.rows.find((item) => item.kind === "seats") as Row;
		row.included = (row.included / PER_SEAT) * perSeat;
		for (const item of this.rows)
			if (item.kind === "seats" || item.kind === "priced") item.usage = 0;
	}
	reset() {
		for (const row of this.rows)
			if (row.kind === "seats" || row.kind === "priced") row.usage = 0;
		this.metered = 0;
	}
	balance(): Balance {
		const granted = this.rows.reduce(
			(total, row) => total + row.included + row.prepaid,
			0,
		);
		const usage = this.rows.reduce((total, row) => total + row.usage, 0);
		return {
			featureId: "box_gb_minutes",
			granted,
			usage,
			remaining: Math.max(0, granted - usage),
			unlimited: false,
			overageAllowed: true,
			maxPurchase: null,
			nextResetAt: Date.UTC(2026, 11, 7),
			breakdown: this.rows.map((row, i) => ({
				id: `row-${i}`,
				planId: row.kind === "seats" ? null : this.plan,
				includedGrant: row.included,
				prepaidGrant: row.prepaid,
				remaining: Math.max(0, row.included + row.prepaid - row.usage),
				usage: row.usage,
				unlimited: false,
				reset: {
					interval:
						row.kind === "free" || row.kind === "bought" ? "one_off" : "month",
					resetsAt: null,
				},
				price:
					row.kind === "priced"
						? {
								...this.prices.usageBased,
								billingMethod: "usage_based",
								maxPurchase: null,
							}
						: row.kind === "bought"
							? {
									...this.prices.prepaid,
									billingMethod: "prepaid",
									maxPurchase: null,
								}
							: null,
				expiresAt: null,
			})),
		} as unknown as Balance;
	}
	controls(): Controls {
		const feature = { featureId: "box_gb_minutes" };
		if (this.plan === "enterprise") return {};
		if (this.plan === "pro" && this.overage)
			return {
				spendLimits: [
					{
						...feature,
						enabled: true,
						limitType: "usage_percentage",
						overageLimit: 300,
					},
				],
			} as Controls;
		return (
			this.overage
				? { overageAllowed: [{ ...feature, enabled: true }] }
				: {
						overageAllowed: [{ ...feature, enabled: false }],
						spendLimits: [
							{
								...feature,
								enabled: true,
								limitType: "absolute",
								overageLimit: 0,
							},
						],
					}
		) as Controls;
	}
	/** What the card shows, in dollars, through the reader, the router's mapping and the display rule. */
	card() {
		const usage = cloudUsageFromBalances(
			{ box_gb_minutes: this.balance() },
			this.controls(),
		);
		if (!usage) throw new Error("no balance");
		const rate = usage.overagePerGbHour;
		if (rate === null) throw new Error("no usage-based price");
		const { allowance } = allowanceOf(usage, new Date(), rate);
		const shown = cloudUsageDisplay(
			allowance,
			{ gbHours: this.metered / 60, usd: (this.metered / 60) * rate },
			rate,
		);
		const $ = (usd: number) => Math.round(usd * 100) / 100;
		return {
			used: $(shown.used.usd),
			held: shown.held && $(shown.held.usd),
			over: shown.over && $(shown.over.usd),
			lines: shown.lines.map(
				(line) => `${line.kind} ${$(line.used.usd)} of ${$(line.total.usd)}`,
			),
		};
	}
}

type Step =
	| { track: number }
	| { buy: number }
	| { free: number }
	| { seats: number }
	| { upgradeToUltra: true }
	| { overage: boolean }
	| { sandbox: Snapshot; metered: number }
	/** Usage in the events that billing has not counted yet. */
	| { notCounted: number }
	| { reset: true };
interface Expect {
	used: number;
	held: number;
	over?: number;
	lines: string[];
}

const t = (track: number): Step => ({ track });
const RESET: Step = { reset: true };

/** Team: 1 seat holds $72 (72,000 GB-minutes at $0.06 a GB-hour). Pro and the contract hold $50. */
const SCENARIOS: {
	name: string;
	plan: Plan;
	seats?: number;
	prices?: Prices;
	steps: [Step, Expect][];
}[] = [
	{
		name: "A custom-priced Team customer: the card uses its own usage-based price",
		plan: "team",
		prices: CUSTOM,
		steps: [
			[t(36_000), { used: 18, held: 36, lines: ["included 18 of 36"] }],
			[
				{ buy: 6_000 },
				{
					used: 18,
					held: 39,
					lines: ["included 18 of 36", "bought 0 of 3"],
				},
			],
		],
	},
	{
		name: "Under the allowance, then a reset",
		plan: "team",
		steps: [
			[t(50_000), { used: 50, held: 72, lines: ["included 50 of 72"] }],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
		],
	},
	{
		name: "Exactly at the allowance",
		plan: "team",
		steps: [
			[t(72_000), { used: 72, held: 72, lines: ["included 72 of 72"] }],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
		],
	},
	{
		name: "Overage off, 102% used: billing stops at 100% and charges nothing past it",
		plan: "team",
		steps: [
			[
				{ sandbox: "team-at-limit-past-it-dropped", metered: 73_440 },
				{ used: 72, held: 72, lines: ["included 72 of 72"] },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
		],
	},
	{
		name: "Overage off, a top-up as large as the seats' amount, 102% used",
		plan: "team",
		steps: [
			[
				{ buy: 72_000 },
				{
					used: 0,
					held: 144,
					lines: ["included 0 of 72", "bought 0 of 72"],
				},
			],
			[
				t(73_440),
				{
					used: 73.44,
					held: 144,
					lines: ["included 72 of 72", "bought 1.44 of 72"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 142.56,
					lines: ["included 0 of 72", "bought 0 of 70.56"],
				},
			],
		],
	},
	{
		name: "Overage on (a contract), 102% used: over by the 2%",
		plan: "enterprise",
		steps: [
			[
				t(51_000),
				{
					used: 51,
					held: 50,
					over: 1,
					lines: ["included 50 of 50"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 50,
					lines: ["included 0 of 50"],
				},
			],
		],
	},
	{
		name: "A bought pack across a reset: the new period counts from its first day",
		plan: "team",
		steps: [
			[
				{ sandbox: "team-pack-before-reset", metered: 75_000 },
				{
					used: 75,
					held: 78,
					lines: ["included 72 of 72", "bought 3 of 6"],
				},
			],
			[
				{ sandbox: "team-pack-after-reset", metered: 1_000 },
				{
					used: 1,
					held: 75,
					lines: ["included 1 of 72", "bought 0 of 3"],
				},
			],
		],
	},
	{
		name: "A bought credit over three periods: spent credit leaves what is held",
		plan: "team",
		steps: [
			[
				{ buy: 72_000 },
				{
					used: 0,
					held: 144,
					lines: ["included 0 of 72", "bought 0 of 72"],
				},
			],
			[
				t(100_000),
				{
					used: 100,
					held: 144,
					lines: ["included 72 of 72", "bought 28 of 72"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 116,
					lines: ["included 0 of 72", "bought 0 of 44"],
				},
			],
			[
				t(80_000),
				{
					used: 80,
					held: 116,
					lines: ["included 72 of 72", "bought 8 of 44"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 108,
					lines: ["included 0 of 72", "bought 0 of 36"],
				},
			],
		],
	},
	{
		name: "A free credit used past the seats, carried into the next period",
		plan: "team",
		steps: [
			[
				{ free: 10_000 },
				{
					used: 0,
					held: 82,
					lines: ["included 0 of 72", "freeCredits 0 of 10"],
				},
			],
			[
				t(75_000),
				{
					used: 75,
					held: 82,
					lines: ["included 72 of 72", "freeCredits 3 of 10"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 79,
					lines: ["included 0 of 72", "freeCredits 0 of 7"],
				},
			],
		],
	},
	{
		name: "Limit reached, then a pack bought: the card never reads lower than the page, so the dropped usage counts against the pack",
		plan: "team",
		steps: [
			[t(72_600), { used: 72, held: 72, lines: ["included 72 of 72"] }],
			[
				{ buy: 6_000 },
				{
					used: 72.6,
					held: 78.6,
					lines: ["included 72 of 72", "bought 0.6 of 6.6"],
				},
			],
		],
	},
	{
		name: "A pack with no draw counted yet takes the usage past the included amount",
		plan: "team",
		steps: [
			[
				{ buy: 6_000 },
				{
					used: 0,
					held: 78,
					lines: ["included 0 of 72", "bought 0 of 6"],
				},
			],
			[
				t(72_000),
				{
					used: 72,
					held: 78,
					lines: ["included 72 of 72", "bought 0 of 6"],
				},
			],
			[
				{ notCounted: 1_200 },
				{
					used: 73.2,
					held: 79.2,
					lines: ["included 72 of 72", "bought 1.2 of 7.2"],
				},
			],
		],
	},
	{
		name: "The seats' amount and a pack both used up; the spent pack leaves the next period",
		plan: "team",
		steps: [
			[
				{ buy: 6_000 },
				{
					used: 0,
					held: 78,
					lines: ["included 0 of 72", "bought 0 of 6"],
				},
			],
			[
				t(80_000),
				{
					used: 78,
					held: 78,
					lines: ["included 72 of 72", "bought 6 of 6"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
		],
	},
	{
		name: "Running at the limit across the reset",
		plan: "team",
		steps: [
			[
				{ sandbox: "team-at-limit-past-it-dropped", metered: 72_300 },
				{ used: 72, held: 72, lines: ["included 72 of 72"] },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
			[t(300), { used: 0.3, held: 72, lines: ["included 0.3 of 72"] }],
		],
	},
	{
		name: "Usage recorded while overage was allowed, then overage turned off: billing still invoices it, the card shows none over",
		plan: "team",
		steps: [
			[
				{ sandbox: "team-priced-row-then-overage-off", metered: 80_000 },
				{
					used: 72,
					held: 72,
					lines: ["included 72 of 72"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
		],
	},
	{
		name: "A seat added after the limit",
		plan: "team",
		steps: [
			[t(72_000), { used: 72, held: 72, lines: ["included 72 of 72"] }],
			[{ seats: 2 }, { used: 72, held: 144, lines: ["included 72 of 144"] }],
		],
	},
	{
		name: "A used seat removed: billing forgives its usage",
		plan: "team",
		seats: 2,
		steps: [
			[t(92_000), { used: 92, held: 144, lines: ["included 92 of 144"] }],
			[{ seats: 1 }, { used: 72, held: 72, lines: ["included 72 of 72"] }],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
				},
			],
		],
	},
	{
		name: "An upgrade to Ultra mid-period: billing starts its usage at 0, the card keeps the period's",
		plan: "team",
		steps: [
			[t(50_000), { used: 50, held: 72, lines: ["included 50 of 72"] }],
			[
				{ upgradeToUltra: true },
				{ used: 50, held: 240, lines: ["included 50 of 240"] },
			],
		],
	},
	{
		name: "Pro at its 300% cap",
		plan: "pro",
		steps: [
			[
				{ sandbox: "pro-at-cap", metered: 210_000 },
				{
					used: 200,
					held: 50,
					over: 150,
					lines: ["included 50 of 50"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 50,
					lines: ["included 0 of 50"],
				},
			],
		],
	},
	{
		name: "Pro with overage off: as Team",
		plan: "pro",
		steps: [
			[{ overage: false }, { used: 0, held: 50, lines: ["included 0 of 50"] }],
			[t(52_000), { used: 50, held: 50, lines: ["included 50 of 50"] }],
		],
	},
	{
		name: "A contract far over, never stopped",
		plan: "enterprise",
		steps: [
			[
				t(500_000),
				{
					used: 500,
					held: 50,
					over: 450,
					lines: ["included 50 of 50"],
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 50,
					lines: ["included 0 of 50"],
				},
			],
		],
	},
];

describe("cloud usage card across billing periods", () => {
	test.each(SCENARIOS)("$name", ({ plan, seats, prices, steps }) => {
		const ledger = new Ledger(plan, seats, prices);
		for (const [step, expected] of steps) {
			if ("track" in step) ledger.track(step.track);
			if ("buy" in step) ledger.credit("bought", step.buy);
			if ("free" in step) ledger.credit("free", step.free);
			if ("seats" in step) ledger.seats(step.seats);
			if ("upgradeToUltra" in step) ledger.upgrade(240_000);
			if ("overage" in step) ledger.overage = step.overage;
			if ("sandbox" in step) ledger.load(step.sandbox, step.metered);
			if ("notCounted" in step) ledger.metered += step.notCounted;
			if ("reset" in step) ledger.reset();
			expect(ledger.card()).toEqual({ over: null, ...expected });
		}
	});
});
