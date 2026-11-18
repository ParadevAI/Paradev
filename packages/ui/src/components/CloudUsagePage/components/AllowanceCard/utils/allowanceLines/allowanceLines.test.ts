import { describe, expect, it } from "bun:test";
import { allowanceLines } from "./allowanceLines";

const base = {
	includedGbHours: 4000,
	usedGbHours: 4000,
	overageGbHours: 0,
	prepaidRemainingGbHours: 0,
	resetsAt: new Date("2026-11-27T00:00:00Z"),
	usedUsd: 240,
	includedUsd: 240,
	overageUsd: 0,
	seats: 8,
	bought: null,
	freeCredits: null,
	extraUsageLimit: null,
	limitReached: false,
};
const used = (gbHours: number) => ({ gbHours, usd: gbHours * 0.06 });
const INCLUDED = used(4000);

describe("allowanceLines", () => {
	it("measures against the included total plus the cap, with lines in the design's order", () => {
		const {
			lines,
			cap,
			hasCap,
			used: total,
		} = allowanceLines(
			{
				...base,
				overageGbHours: 1000,
				overageUsd: 60,
				freeCredits: {
					usedGbHours: 500,
					totalGbHours: 500,
					usedUsd: 30,
					totalUsd: 30,
				},
				extraUsageLimit: { gbHours: 4000, usd: 240 },
			},
			INCLUDED,
			used(5500),
		);
		expect(lines.map((line) => line.kind)).toEqual([
			"included",
			"freeCredits",
			"extra",
		]);
		expect(hasCap).toBe(true);
		expect(cap).toEqual({ gbHours: 8500, usd: 510 });
		expect(total).toEqual({ gbHours: 5500, usd: 330 });
	});

	it("shows usage past every line as its own line, so the headline and the lines agree", () => {
		const {
			lines,
			used: total,
			scale,
		} = allowanceLines(
			{ ...base, extraUsageLimit: { gbHours: 0, usd: 0 }, limitReached: true },
			INCLUDED,
			used(4500),
		);
		expect(lines.at(-1)).toMatchObject({
			kind: "beyond",
			used: { gbHours: 500 },
		});
		expect(total.gbHours).toBe(4500);
		expect(scale.gbHours).toBe(4500);
	});

	it("leaves the bar open when no cap is known and the limit is not reached", () => {
		const { lines, hasCap, scale } = allowanceLines(
			{ ...base, overageGbHours: 800, overageUsd: 48, limitReached: null },
			INCLUDED,
			used(4800),
		);
		expect(lines.at(-1)).toMatchObject({ kind: "extra", total: null });
		expect(hasCap).toBe(false);
		expect(scale.gbHours).toBe(6000);
	});
});
