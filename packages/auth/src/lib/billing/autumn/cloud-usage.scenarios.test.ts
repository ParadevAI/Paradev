import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { cloudUsageDisplay } from "@superset/shared/cloud-usage-display";
import { allowanceOf, cloudUsageFromBalances } from "./cloud-usage";

/**
 * The cloud usage card across billing periods. The fake ledger follows what Autumn's sandbox did
 * with the meter's own calls (see the "Cloud usage: states, display and the invariant" page): usage
 * draws the seats' amount, then credits, then the priced monthly row, which fills only while
 * overage is allowed; past that, usage is dropped. A reset invoices the priced row and starts the
 * monthly rows at 0; credits carry. The test writes docs/cloud-usage-display.md from this table.
 */

const PER_SEAT = 72_000;
const RATE = 0.06;
const DOC = new URL(
	"../../../../../../docs/cloud-usage-display.md",
	import.meta.url,
);

type Plan = "team" | "pro" | "enterprise";
interface Row {
	kind: "seats" | "priced" | "free" | "bought";
	included: number;
	prepaid: number;
	usage: number;
}

class Ledger {
	rows: Row[];
	overage: boolean;
	constructor(
		readonly plan: Plan,
		seats = 1,
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
	private room(row: Row): number {
		const held = row.included + row.prepaid - row.usage;
		if (row.kind !== "priced" || !this.overage) return Math.max(0, held);
		const cap =
			this.plan === "pro" ? 3 * row.included : Number.POSITIVE_INFINITY;
		return Math.max(0, held) + cap - Math.max(0, row.usage - row.included);
	}
	private ordered(): Row[] {
		const rank = { seats: 0, free: 1, bought: 2, priced: 3 };
		return [...this.rows].sort((a, b) => rank[a.kind] - rank[b.kind]);
	}
	track(gbMinutes: number) {
		let left = gbMinutes;
		for (const row of this.ordered()) {
			const drawn = Math.min(left, this.room(row));
			row.usage += drawn;
			left -= drawn;
		}
	}
	mayStart() {
		return this.rows.reduce((total, row) => total + this.room(row), 0) >= 240;
	}
	credit(kind: "free" | "bought", gbMinutes: number) {
		const row = this.rows.find((item) => item.kind === kind);
		if (row) row[kind === "free" ? "included" : "prepaid"] += gbMinutes;
		else
			this.rows.push({
				kind,
				included: kind === "free" ? gbMinutes : 0,
				prepaid: kind === "bought" ? gbMinutes : 0,
				usage: 0,
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
			if (item.kind !== "free" && item.kind !== "bought") item.usage = 0;
	}
	/** Closes the period: returns the dollars billing charges for usage. */
	reset(): number {
		const charged = this.rows
			.filter((row) => row.kind === "priced")
			.reduce((total, row) => total + Math.max(0, row.usage - row.included), 0);
		for (const row of this.rows)
			if (row.kind === "seats" || row.kind === "priced") row.usage = 0;
		return (charged / 60) * RATE;
	}
	balances() {
		const granted = this.rows.reduce(
			(total, row) => total + row.included + row.prepaid,
			0,
		);
		const usage = this.rows.reduce((total, row) => total + row.usage, 0);
		return {
			box_gb_minutes: {
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
							row.kind === "free" || row.kind === "bought"
								? "one_off"
								: "month",
						resetsAt: null,
					},
					price:
						row.kind === "priced"
							? {
									amount: 1,
									billingUnits: 1000,
									billingMethod: "usage_based",
									maxPurchase: null,
								}
							: row.kind === "bought"
								? {
										amount: RATE,
										billingUnits: 60,
										billingMethod: "prepaid",
										maxPurchase: null,
									}
								: null,
					expiresAt: null,
				})),
			},
		} as unknown as Parameters<typeof cloudUsageFromBalances>[0];
	}
	controls() {
		const feature = { featureId: "box_gb_minutes" };
		return (
			this.plan === "enterprise"
				? {}
				: this.plan === "pro" && this.overage
					? {
							spendLimits: [
								{
									...feature,
									enabled: true,
									limitType: "usage_percentage",
									overageLimit: 300,
								},
							],
						}
					: this.overage
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
		) as Parameters<typeof cloudUsageFromBalances>[1];
	}
	/** What the card shows, in dollars. */
	sees() {
		const usage = cloudUsageFromBalances(
			this.balances(),
			this.controls(),
			null,
			RATE,
		);
		if (!usage) throw new Error("no balance");
		const { allowance } = allowanceOf(usage, new Date(), RATE);
		const shown = cloudUsageDisplay(allowance as never, { gbHours: 0, usd: 0 });
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
	| { reset: true };
interface Expect {
	used: number;
	held: number;
	over?: number;
	lines: string[];
	mayStart: boolean;
	/** Dollars for usage on the invoice at the reset just before. */
	charged?: number;
}
interface Scenario {
	name: string;
	plan: Plan;
	seats?: number;
	steps: [Step, Expect][];
}

const t = (track: number): Step => ({ track });
const RESET: Step = { reset: true };

/** The specification. Team: 1 seat holds $72 (72,000 GB-minutes). Pro and enterprise hold $50. */
const SCENARIOS: Scenario[] = [
	{
		name: "Under the allowance, then a reset",
		plan: "team",
		steps: [
			[
				t(50_000),
				{ used: 50, held: 72, lines: ["included 50 of 72"], mayStart: true },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
					mayStart: true,
					charged: 0,
				},
			],
		],
	},
	{
		name: "Exactly at the allowance",
		plan: "team",
		steps: [
			[
				t(72_000),
				{ used: 72, held: 72, lines: ["included 72 of 72"], mayStart: false },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
					mayStart: true,
					charged: 0,
				},
			],
		],
	},
	{
		name: "Overage off, no top-up, 102% used: billing stops at 100%",
		plan: "team",
		steps: [
			[
				t(73_440),
				{ used: 72, held: 72, lines: ["included 72 of 72"], mayStart: false },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
					mayStart: true,
					charged: 0,
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
					mayStart: true,
				},
			],
			[
				t(73_440),
				{
					used: 73.44,
					held: 144,
					lines: ["included 72 of 72", "bought 1.44 of 72"],
					mayStart: true,
				},
			],
			[
				RESET,
				{
					used: 1.44,
					held: 144,
					lines: ["included 0 of 72", "bought 1.44 of 72"],
					mayStart: true,
					charged: 0,
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
					mayStart: true,
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 50,
					lines: ["included 0 of 50"],
					mayStart: true,
					charged: 1,
				},
			],
		],
	},
	{
		name: "A bought credit lasts three periods, drawn after each period's seats",
		plan: "team",
		steps: [
			[
				{ buy: 72_000 },
				{
					used: 0,
					held: 144,
					lines: ["included 0 of 72", "bought 0 of 72"],
					mayStart: true,
				},
			],
			[
				t(100_000),
				{
					used: 100,
					held: 144,
					lines: ["included 72 of 72", "bought 28 of 72"],
					mayStart: true,
				},
			],
			[
				RESET,
				{
					used: 28,
					held: 144,
					lines: ["included 0 of 72", "bought 28 of 72"],
					mayStart: true,
					charged: 0,
				},
			],
			[
				t(80_000),
				{
					used: 108,
					held: 144,
					lines: ["included 72 of 72", "bought 36 of 72"],
					mayStart: true,
				},
			],
			[
				RESET,
				{
					used: 36,
					held: 144,
					lines: ["included 0 of 72", "bought 36 of 72"],
					mayStart: true,
					charged: 0,
				},
			],
		],
	},
	{
		name: "A free credit, used past the seats, carried into the next period",
		plan: "team",
		steps: [
			[
				{ free: 10_000 },
				{
					used: 0,
					held: 82,
					lines: ["included 0 of 72", "freeCredits 0 of 10"],
					mayStart: true,
				},
			],
			[
				t(75_000),
				{
					used: 75,
					held: 82,
					lines: ["included 72 of 72", "freeCredits 3 of 10"],
					mayStart: true,
				},
			],
			[
				RESET,
				{
					used: 3,
					held: 82,
					lines: ["included 0 of 72", "freeCredits 3 of 10"],
					mayStart: true,
					charged: 0,
				},
			],
		],
	},
	{
		name: "Limit reached, then a pack bought: the dropped usage is not taken from it",
		plan: "team",
		steps: [
			[
				t(72_600),
				{ used: 72, held: 72, lines: ["included 72 of 72"], mayStart: false },
			],
			[
				{ buy: 6_000 },
				{
					used: 72,
					held: 78,
					lines: ["included 72 of 72", "bought 0 of 6"],
					mayStart: true,
				},
			],
		],
	},
	{
		name: "The seats' amount and a pack both used up",
		plan: "team",
		steps: [
			[
				{ buy: 6_000 },
				{
					used: 0,
					held: 78,
					lines: ["included 0 of 72", "bought 0 of 6"],
					mayStart: true,
				},
			],
			[
				t(80_000),
				{
					used: 78,
					held: 78,
					lines: ["included 72 of 72", "bought 6 of 6"],
					mayStart: false,
				},
			],
			[
				RESET,
				{
					used: 6,
					held: 78,
					lines: ["included 0 of 72", "bought 6 of 6"],
					mayStart: true,
					charged: 0,
				},
			],
		],
	},
	{
		name: "Running at the limit across the reset",
		plan: "team",
		steps: [
			[
				t(72_300),
				{ used: 72, held: 72, lines: ["included 72 of 72"], mayStart: false },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
					mayStart: true,
					charged: 0,
				},
			],
			[
				t(300),
				{ used: 0.3, held: 72, lines: ["included 0.3 of 72"], mayStart: true },
			],
		],
	},
	{
		name: "Usage recorded while overage was allowed, then overage turned off",
		plan: "team",
		steps: [
			[
				{ overage: true },
				{ used: 0, held: 72, lines: ["included 0 of 72"], mayStart: true },
			],
			[
				t(80_000),
				{
					used: 80,
					held: 72,
					over: 8,
					lines: ["included 72 of 72"],
					mayStart: true,
				},
			],
			[
				{ overage: false },
				{
					used: 80,
					held: 72,
					over: 8,
					lines: ["included 72 of 72"],
					mayStart: false,
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
					mayStart: true,
					charged: 8,
				},
			],
		],
	},
	{
		name: "A seat added after the limit",
		plan: "team",
		steps: [
			[
				t(72_000),
				{ used: 72, held: 72, lines: ["included 72 of 72"], mayStart: false },
			],
			[
				{ seats: 2 },
				{ used: 72, held: 144, lines: ["included 72 of 144"], mayStart: true },
			],
		],
	},
	{
		name: "A used seat removed: billing forgives its usage",
		plan: "team",
		seats: 2,
		steps: [
			[
				t(92_000),
				{ used: 92, held: 144, lines: ["included 92 of 144"], mayStart: true },
			],
			[
				{ seats: 1 },
				{ used: 72, held: 72, lines: ["included 72 of 72"], mayStart: false },
			],
			[
				RESET,
				{
					used: 0,
					held: 72,
					lines: ["included 0 of 72"],
					mayStart: true,
					charged: 0,
				},
			],
		],
	},
	{
		name: "An upgrade to Ultra mid-period starts usage at 0",
		plan: "team",
		steps: [
			[
				t(50_000),
				{ used: 50, held: 72, lines: ["included 50 of 72"], mayStart: true },
			],
			[
				{ upgradeToUltra: true },
				{ used: 0, held: 240, lines: ["included 0 of 240"], mayStart: true },
			],
		],
	},
	{
		name: "Pro at its 300% cap",
		plan: "pro",
		steps: [
			[
				t(210_000),
				{
					used: 200,
					held: 50,
					over: 150,
					lines: ["included 50 of 50"],
					mayStart: false,
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 50,
					lines: ["included 0 of 50"],
					mayStart: true,
					charged: 150,
				},
			],
		],
	},
	{
		name: "Pro with overage off: as Team",
		plan: "pro",
		steps: [
			[
				{ overage: false },
				{ used: 0, held: 50, lines: ["included 0 of 50"], mayStart: true },
			],
			[
				t(52_000),
				{ used: 50, held: 50, lines: ["included 50 of 50"], mayStart: false },
			],
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
					mayStart: true,
				},
			],
			[
				RESET,
				{
					used: 0,
					held: 50,
					lines: ["included 0 of 50"],
					mayStart: true,
					charged: 450,
				},
			],
		],
	},
];

function run(scenario: Scenario) {
	const ledger = new Ledger(scenario.plan, scenario.seats);
	return scenario.steps.map(([step, expected]) => {
		let charged: number | undefined;
		if ("track" in step) ledger.track(step.track);
		if ("buy" in step) ledger.credit("bought", step.buy);
		if ("free" in step) ledger.credit("free", step.free);
		if ("seats" in step) ledger.seats(step.seats);
		if ("upgradeToUltra" in step) ledger.upgrade(240_000);
		if ("overage" in step) ledger.overage = step.overage;
		if ("reset" in step) charged = Math.round(ledger.reset() * 100) / 100;
		return {
			actual: {
				...ledger.sees(),
				mayStart: ledger.mayStart(),
				...(charged === undefined ? {} : { charged }),
			},
			expected: { over: null, ...expected },
		};
	});
}

const stepText = (step: Step) =>
	"track" in step
		? `${step.track.toLocaleString("en-US")} GB-min used`
		: "buy" in step
			? `${step.buy.toLocaleString("en-US")} GB-min pack bought`
			: "free" in step
				? `${step.free.toLocaleString("en-US")} GB-min free credit`
				: "seats" in step
					? `seats set to ${step.seats}`
					: "upgradeToUltra" in step
						? "upgrade to Ultra"
						: "overage" in step
							? `overage turned ${step.overage ? "on" : "off"}`
							: "period ends";

function doc() {
	const money = (usd: number) =>
		`$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
	const rows = SCENARIOS.flatMap((scenario) =>
		scenario.steps.map(([step, e], i) => {
			const head = `${money(e.used)} used of ${money(e.held)}${e.over ? `, over by ${money(e.over)}` : ""}`;
			const lines = e.lines
				.map((line) =>
					line.replace(
						/^(\w+) ([\d.]+) of ([\d.]+)$/,
						(_, k, u, tot) =>
							`${{ included: "Included", freeCredits: "Free credits", bought: "Bought credits" }[k as "included"]} ${money(Number(u))} of ${money(Number(tot))}`,
					),
				)
				.join("; ");
			return `| ${i === 0 ? `**${scenario.name}** (${scenario.plan})` : ""} | ${stepText(step)} | ${head} | ${lines} | ${e.charged === undefined ? "" : money(e.charged)} | ${e.mayStart ? "yes" : "no"} |`;
		}),
	);
	return [
		"# What the cloud usage card shows",
		"",
		"Generated by `packages/auth/src/lib/billing/autumn/cloud-usage.scenarios.test.ts`. Do not edit:",
		"change the scenarios and run the test.",
		"",
		"The card shows billing's own numbers, as they are:",
		"",
		'- One line for each thing the organization holds, as "X of Y": the amount included with its',
		"  seats, free credits and bought credits. Usage draws the seats' amount first, then credits.",
		'- "Over" is the usage on billing\'s priced monthly row, which billing charges at the period end.',
		"  With overage off, billing stops at what is held and charges nothing past it, so over stays 0.",
		"- The seats' amount starts again each period. Credits never expire and carry over; their line",
		"  counts use since they were given.",
		"- Our own usage tables can show a few minutes more than the card: workspaces stop a few minutes",
		"  after the limit, and billing does not count those minutes. The card does not explain the gap.",
		"- A past period, or billing data not loaded yet, shows the period's usage only, with no lines.",
		"",
		'Team holds $72 per seat (72,000 GB-minutes at $0.06 a GB-hour). "Charged" is the usage on',
		"the invoice at the period end; seats are billed apart.",
		"",
		"| Scenario | Step | Card headline | Lines | Charged | New workspaces may start |",
		"| --- | --- | --- | --- | --- | --- |",
		...rows,
		"",
	].join("\n");
}

describe("cloud usage card scenarios", () => {
	for (const scenario of SCENARIOS) {
		test(scenario.name, () => {
			for (const { actual, expected } of run(scenario))
				expect(actual).toEqual(expected);
		});
	}

	test("docs/cloud-usage-display.md is the table above", () => {
		const text = doc();
		const current = readFileSync(DOC, "utf8");
		if (current !== text) writeFileSync(DOC, text);
		expect(current).toBe(text);
	});
});
