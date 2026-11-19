import { expect, test } from "bun:test";
import {
	type CloudAllowance,
	cloudUsageDisplay,
} from "@superset/shared/cloud-usage-display";
import RECORDED from "../../../../../ui/src/components/CloudUsagePage/fixtures/allowances.json";
import { allowanceOf, cloudUsageFromBalances } from "./cloud-usage";

const RATE = 0.06;
type Balance = Parameters<typeof cloudUsageFromBalances>[0][string];
type Controls = Parameters<typeof cloudUsageFromBalances>[1];

test.each(
	Object.entries(RECORDED),
)("the %s story allowance is what the reader and the router's mapping give", (_, state) => {
	const read = cloudUsageFromBalances(
		{ box_gb_minutes: state.balance as unknown as Balance },
		state.controls as Controls,
		null,
		RATE,
		state.seats,
	);
	if (!read) throw new Error("no balance");
	// A billing value cached before seats, credits and the cap were read has none of them.
	const value = state.cached
		? {
				...read,
				bought: null,
				freeCredits: null,
				seats: null,
				overageLimit: null,
				limitReached: null,
			}
		: read;
	const { allowance, unavailable } = allowanceOf(
		value,
		new Date(state.allowance.resetsAt),
		RATE,
	);
	expect(JSON.parse(JSON.stringify({ allowance, unavailable }))).toEqual({
		allowance: state.allowance,
		unavailable: state.unavailable,
	});
});

const card = (name: keyof typeof RECORDED) => {
	const state = RECORDED[name];
	const metered = {
		gbHours: state.eventsGbHours,
		usd: state.eventsGbHours * RATE,
	};
	const shown = cloudUsageDisplay(state.allowance as CloudAllowance, metered);
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

test("after packs were bought, the carried pack takes the usage billing's count lost", () => {
	expect(card("reattached")).toEqual({
		used: 1029.57,
		held: 1260.44,
		over: null,
		lines: ["included 360 of 360", "bought 669.57 of 900.44"],
	});
});

test("a monthly row raised by hand above its grant shows the period's usage only", () => {
	expect(card("raisedByHand")).toEqual({
		used: 180,
		held: null,
		over: null,
		lines: [],
	});
});

test("with overage off, usage billing put on the priced row is not shown over", () => {
	expect(card("overageOffBilled")).toEqual({
		used: 72,
		held: 72,
		over: null,
		lines: ["included 72 of 72"],
	});
});
