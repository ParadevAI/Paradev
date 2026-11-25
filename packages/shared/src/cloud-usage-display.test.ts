import { describe, expect, it } from "bun:test";
import { type CloudAllowance, cloudUsageDisplay } from "./cloud-usage-display";

const RATE = 0.06;
const END = new Date("2026-11-27T00:00:00Z");

const card = (allowance: CloudAllowance, eventsGbHours: number) => {
	const shown = cloudUsageDisplay(
		allowance,
		{ gbHours: eventsGbHours, usd: eventsGbHours * RATE },
		RATE,
	);
	const usd = (amount: { usd: number } | null) =>
		amount && Math.round(amount.usd * 100) / 100;
	return {
		used: usd(shown.used),
		held: usd(shown.held),
		over: usd(shown.over),
		lines: shown.lines.map(
			(line) => `${line.kind} ${usd(line.used)} of ${usd(line.total)}`,
		),
	};
};

describe("cloudUsageDisplay on balance shapes seen live", () => {
	it("after packs were bought, the carried pack takes the usage billing's count lost", () => {
		expect(
			card(
				{
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
					resetsAt: END,
				},
				17159.5,
			),
		).toEqual({
			used: 1029.57,
			held: 1260.44,
			over: null,
			lines: ["included 360 of 360", "bought 669.57 of 900.44"],
		});
	});

	it("a monthly row raised by hand above its grant shows the period's usage only", () => {
		expect(
			card(
				{
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
					resetsAt: END,
				},
				3000,
			),
		).toEqual({
			used: 180,
			held: null,
			over: null,
			lines: [],
		});
	});

	it("with overage off, usage billing put on the priced row is not shown as overage", () => {
		expect(
			card(
				{
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
					resetsAt: END,
				},
				2732.54,
			),
		).toEqual({
			used: 72,
			held: 72,
			over: null,
			lines: ["included 72 of 72"],
		});
	});
});

describe("cloudUsageDisplay prices GB-hours at the organization's rate", () => {
	const allowance: CloudAllowance = {
		includedGbHours: 100,
		usedGbHours: 37.5,
		overageGbHours: 0,
		prepaidRemainingGbHours: 0,
		resetsAt: END,
		usedUsd: 2.25,
		includedUsd: 6,
		overageUsd: 0,
		seats: 1,
		bought: null,
		freeCredits: null,
		extraUsageLimit: null,
		limitReached: false,
	};

	it.each([
		["the catalog", RATE],
		["a custom-priced customer's own", 0.03],
	])("at %s rate, the headline is the By day total, with or without a breakdown", (_, rate) => {
		const metered = { gbHours: 37.5, usd: 37.5 * rate };
		for (const breakdown of [allowance, null]) {
			expect(cloudUsageDisplay(breakdown, metered, rate).used.usd).toBe(
				metered.usd,
			);
		}
		expect(cloudUsageDisplay(allowance, metered, rate).held?.usd).toBe(
			100 * rate,
		);
	});

	it("keeps the dollars of usage under a cent", () => {
		const shown = cloudUsageDisplay(
			{ ...allowance, usedGbHours: 0.07 },
			{ gbHours: 0.07, usd: 0.07 * RATE },
			RATE,
		);
		expect(shown.used.usd).toBe(0.07 * RATE);
		expect(shown.lines[0]?.used.usd).toBe(0.07 * RATE);
	});

	it("with no rate it shows the metered usage only", () => {
		const metered = { gbHours: 37.5, usd: 2.25 };
		expect(cloudUsageDisplay(allowance, metered, null)).toEqual({
			used: metered,
			held: null,
			over: null,
			lines: [],
		});
	});
});
