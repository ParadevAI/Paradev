import { describe, expect, it } from "bun:test";
import { type BillingState, cardArgs } from "../../../../fixtures";
import type { PricedAllowance } from "../../../../utils/priced";
import { type Amount, allowanceLines } from "./allowanceLines";

type Lines = ReturnType<typeof allowanceLines>;

const RATE = 0.06;
const gbh = (gbHours: number): Amount => ({ gbHours, usd: gbHours * RATE });
const kinds = (lines: Lines["lines"]) => lines.map((line) => line.kind);
const near = (a: number, b: number) =>
	expect(Math.abs(a - b)).toBeLessThan(0.01);

/** The headline's usage, in GB-hours and in dollars at the stories' rate. */
function expectHeadline({ used }: Lines, gbHours: number) {
	near(used.gbHours, gbHours);
	near(used.usd, gbHours * RATE);
}

/** The card's lines for a story state, whose allowance comes from the billing reader and the router's mapping. */
function linesOf(state: BillingState) {
	const { allowance, total, period } = cardArgs(state);
	if (
		!allowance ||
		allowance.includedGbHours === null ||
		allowance.includedUsd === null
	) {
		throw new Error(`${state} has no included total`);
	}
	const unread = (period?.unavailable ?? [])
		.filter((item) => item.reason === "not_read")
		.map((item) => item.field);
	return {
		allowance,
		...allowanceLines(
			allowance,
			{ gbHours: allowance.includedGbHours, usd: allowance.includedUsd },
			{ gbHours: total.gbHours, usd: total.usageUsd },
			unread,
		),
	};
}

/** Northwind's billing: 14 seats of 500 GB-hours, a 2,000 GB-hour free credit used up, then 6,200 GB-hours of extra usage. */
const NORTHWIND: PricedAllowance = {
	includedGbHours: 7000,
	usedGbHours: 13200,
	overageGbHours: 6200,
	prepaidRemainingGbHours: 0,
	resetsAt: new Date("2026-11-27T00:00:00Z"),
	usedUsd: 13200 * RATE,
	includedUsd: 7000 * RATE,
	overageUsd: 6200 * RATE,
	seats: 14,
	bought: null,
	freeCredits: {
		usedGbHours: 2000,
		totalGbHours: 2000,
		usedUsd: 2000 * RATE,
		totalUsd: 2000 * RATE,
	},
	extraUsageLimit: gbh(27000),
	limitReached: false,
};
/** The same value cached before seats, credits and the cap were read. */
const CACHED: PricedAllowance = {
	...NORTHWIND,
	seats: null,
	bought: null,
	freeCredits: null,
	extraUsageLimit: null,
	limitReached: null,
};
const ALL_UNREAD = [
	"seats",
	"bought",
	"freeCredits",
	"extraUsageLimit",
	"limitReached",
];
const lines = (
	allowance: PricedAllowance,
	periodGbHours: number,
	unread: string[] = [],
) => allowanceLines(allowance, gbh(7000), gbh(periodGbHours), unread);

describe("allowanceLines on story data", () => {
	it("holds what billing counted in the included, credit and extra lines, in the design's order", () => {
		const result = linesOf("northwind");
		expect(kinds(result.lines)).toEqual(["included", "freeCredits", "extra"]);
		expect(result.hasCap).toBe(true);
		near(result.cap.gbHours, 7000 + 2000 + 27000);
		expectHeadline(result, 15200);
	});

	it("shows usage the events hold past billing's own total as Not counted by billing yet", () => {
		const result = linesOf("unbilled");
		near(
			result.lines.find((line) => line.kind === "beyond")?.used.gbHours ?? 0,
			600,
		);
		expectHeadline(result, 15800);
	});

	it("never calls credit usage unbilled when the credits are not read", () => {
		const result = linesOf("notRead");
		expect(kinds(result.lines)).not.toContain("beyond");
		near(
			result.lines.find((line) => line.kind === "notBrokenDown")?.used
				.gbHours ?? 0,
			2000,
		);
		expectHeadline(result, 15200);
	});

	it("with extra usage off, the included total is the cap: no extra line and no open bar", () => {
		const trial = linesOf("trial");
		expect(kinds(trial.lines)).toEqual(["included"]);
		expect(trial.hasCap).toBe(false);
		near(trial.cap.usd, 270);
		expect(trial.scale).toEqual(trial.cap);
		expectHeadline(trial, 3100);
	});

	it("with extra usage off, holds usage past the included amount in the included line when the stop overshoots", () => {
		const result = linesOf("limitReached");
		expect(result.allowance.limitReached).toBe(true);
		expect(kinds(result.lines)).toEqual(["included"]);
		expect(result.lines[0]?.used.gbHours).toBeCloseTo(4650);
		expect(result.lines[0]?.total?.gbHours).toBeCloseTo(4500);
		expectHeadline(result, 4650);
	});

	it("leaves the bar open when the cap is not known and the limit is not reached", () => {
		const result = linesOf("percentCap");
		expect(result.lines.at(-1)).toMatchObject({ kind: "extra", total: null });
		expect(result.hasCap).toBe(false);
		expect(result.scale.usd).toBeGreaterThan(result.cap.usd);
		expectHeadline(result, 15200);
	});
});

describe("allowanceLines on hand-built values", () => {
	it("all lines read: billing's own total is the lines, and only events past it are unbilled", () => {
		const counted = lines(NORTHWIND, 15200);
		expect(kinds(counted.lines)).toEqual(["included", "freeCredits", "extra"]);
		expectHeadline(counted, 15200);
		const ahead = lines(NORTHWIND, 15500);
		near(ahead.lines.at(-1)?.used.gbHours ?? 0, 300);
		expect(ahead.lines.at(-1)?.kind).toBe("beyond");
		expectHeadline(ahead, 15500);
	});

	it("credits not read: what the lines cannot place is Not broken down yet, never unbilled", () => {
		const result = lines(
			{ ...NORTHWIND, bought: null, freeCredits: null },
			15500,
			["bought", "freeCredits"],
		);
		expect(kinds(result.lines)).toEqual(["included", "extra", "notBrokenDown"]);
		near(result.lines.at(-1)?.used.gbHours ?? 0, 2300);
		expectHeadline(result, 15500);
	});

	it("everything not read: the same, and the bar stays open with no known cap", () => {
		const result = lines(CACHED, 15200, ALL_UNREAD);
		expect(kinds(result.lines)).not.toContain("beyond");
		expect(kinds(result.lines)).toContain("notBrokenDown");
		expect(result.scale.gbHours).toBeGreaterThan(result.used.gbHours);
		expectHeadline(result, 15200);
	});

	it("with extra usage off, never calls usage billing counted past the included amount not broken down", () => {
		const result = allowanceLines(
			{
				...NORTHWIND,
				usedGbHours: 7300,
				usedUsd: 7300 * RATE,
				overageGbHours: 0,
				overageUsd: 0,
				freeCredits: null,
				extraUsageLimit: gbh(0),
				limitReached: true,
			},
			gbh(7000),
			gbh(7600),
		);
		expect(kinds(result.lines)).toEqual(["included", "beyond"]);
		near(result.lines[0]?.used.gbHours ?? 0, 7300);
		near(result.lines[1]?.used.gbHours ?? 0, 300);
		expectHeadline(result, 7600);
	});

	it("events below what billing counted add no line, and the lines still add up", () => {
		const result = lines(NORTHWIND, 14000);
		expect(kinds(result.lines)).toEqual(["included", "freeCredits", "extra"]);
		expectHeadline(result, 15200);
	});

	it("names the cap in the headline only when it is known", () => {
		expect(linesOf("northwind").headline).toBe("limit");
		expect(linesOf("trial").headline).toBe("included");
		expect(linesOf("limitReached").headline).toBe("included");
		expect(linesOf("percentCap").headline).toBe("period");
		expect(linesOf("notRead").headline).toBe("period");
		expect(lines(CACHED, 15200, ALL_UNREAD).headline).toBe("period");
		const unknownCap = {
			...NORTHWIND,
			usedGbHours: 6600,
			usedUsd: 6600 * RATE,
			overageGbHours: 0,
			overageUsd: 0,
			freeCredits: null,
			extraUsageLimit: null,
			limitReached: null,
		};
		expect(lines(unknownCap, 6600).headline).toBe("included");
		expect(lines(unknownCap, 7600).headline).toBe("period");
	});
});
