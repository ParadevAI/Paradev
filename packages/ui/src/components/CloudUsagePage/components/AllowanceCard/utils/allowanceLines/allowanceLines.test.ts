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

describe("allowanceLines", () => {
	it("measures against the included total plus the cap, with lines in the design's order", () => {
		const { lines, cap, hasCap } = allowanceLines(
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
			4000,
		);
		expect(lines.map((line) => line.kind)).toEqual([
			"included",
			"freeCredits",
			"extra",
		]);
		expect(hasCap).toBe(true);
		expect(cap).toEqual({ gbHours: 8500, usd: 510 });
	});

	it("has no extra line with overage off, and an open extra line with no cap", () => {
		const off = allowanceLines(
			{ ...base, extraUsageLimit: { gbHours: 0, usd: 0 } },
			4000,
		);
		expect(off.lines.map((line) => line.kind)).toEqual(["included"]);
		expect(off.cap).toEqual({ gbHours: 4000, usd: 240 });

		const open = allowanceLines(
			{ ...base, overageGbHours: 100, overageUsd: 6 },
			4000,
		);
		expect(open.lines.at(-1)).toMatchObject({ kind: "extra", total: null });
		expect(open.hasCap).toBe(false);
		expect(open.scale).toEqual({ gbHours: 4100, usd: 246 });
	});

	it("keeps GB-hours and drops dollars when there is no rate", () => {
		const { cap } = allowanceLines(
			{ ...base, usedUsd: null, includedUsd: null, overageUsd: null },
			4000,
		);
		expect(cap).toEqual({ gbHours: 4000, usd: null });
	});
});
