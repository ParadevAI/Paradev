import { expect, test } from "bun:test";
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
