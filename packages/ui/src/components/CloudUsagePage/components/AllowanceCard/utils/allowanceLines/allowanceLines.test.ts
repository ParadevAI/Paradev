import { describe, expect, it } from "bun:test";
import { type BillingState, cardArgs } from "../../../../fixtures";
import { allowanceLines } from "./allowanceLines";

/** The card's lines for a story state, whose allowance comes from the billing reader and the router's mapping. */
function linesOf(state: BillingState) {
	const { allowance, total } = cardArgs(state);
	if (
		!allowance ||
		allowance.includedGbHours === null ||
		allowance.includedUsd === null
	) {
		throw new Error(`${state} has no included total`);
	}
	return {
		allowance,
		total,
		...allowanceLines(
			allowance,
			{ gbHours: allowance.includedGbHours, usd: allowance.includedUsd },
			{ gbHours: total.gbHours, usd: total.usageUsd },
		),
	};
}

const kinds = (lines: { kind: string }[]) => lines.map((line) => line.kind);
const near = (a: number, b: number) =>
	expect(Math.abs(a - b)).toBeLessThan(0.5);

describe("allowanceLines", () => {
	it("holds what billing counted in the included, credit and extra lines, in the design's order", () => {
		const { lines, used, cap, hasCap, total } = linesOf("northwind");
		expect(kinds(lines)).toEqual(["included", "freeCredits", "extra"]);
		near(used.gbHours, 15200);
		near(used.gbHours, total.gbHours);
		expect(hasCap).toBe(true);
		near(cap.gbHours, 7000 + 2000 + 27000);
	});

	it("shows usage the events hold past billing as Beyond, and only that", () => {
		const { lines, used } = linesOf("unbilled");
		const beyond = lines.find((line) => line.kind === "beyond");
		near(beyond?.used.gbHours ?? 0, 600);
		near(used.gbHours, 15800);
		expect(kinds(linesOf("prepaid").lines)).not.toContain("beyond");
	});

	it("with extra usage off, the included total is the cap: no extra line and no open bar", () => {
		const trial = linesOf("trial");
		expect(kinds(trial.lines)).toEqual(["included"]);
		expect(trial.hasCap).toBe(false);
		near(trial.cap.usd, 270);
		near(trial.used.usd, 186);
		expect(trial.scale).toEqual(trial.cap);
	});

	it("reports the limit reached when extra usage is off and the allowance is used up", () => {
		const { allowance, lines, scale, cap } = linesOf("limitReached");
		expect(allowance.limitReached).toBe(true);
		expect(kinds(lines)).toEqual(["included"]);
		expect(scale).toEqual(cap);
	});

	it("leaves the bar open when the cap is not known and the limit is not reached", () => {
		const { lines, hasCap, scale, cap } = linesOf("percentCap");
		expect(lines.at(-1)).toMatchObject({ kind: "extra", total: null });
		expect(hasCap).toBe(false);
		expect(scale.usd).toBeGreaterThan(cap.usd);
	});
});
