import { expect, test } from "bun:test";
import {
	createClaudePrepaidReader,
	parseClaudePrepaidBalance,
} from "./claude-prepaid";
import { createClaudeRequestClient } from "./claude-request";
import { createQuotaCooldownStore } from "./quota-cooldown-store";

const checkedAt = new Date("2026-10-23T19:00:00Z");
const profile = {
	account: { uuid: "11111111-1111-4111-8111-111111111111" },
	organization: { uuid: "22222222-2222-4222-8222-222222222222" },
};

test.each([
	[{ amount: 8871, currency: "USD" }, 88.71, "USD"],
	[{ amount: 0, currency: "USD" }, 0, "USD"],
	[{ amount: 0, currency: null, balance: null }, 0, null],
	[
		{
			amount: 5597,
			currency: "EUR",
			balance: {
				money: { amount_minor: 5597, currency: "EUR", exponent: 2 },
				credits: null,
			},
			promo_tranches: [{ money: null }],
		},
		55.97,
		"EUR",
	],
	[
		{
			amount: 500,
			balance: { money: { amount_minor: 500, currency: "JPY", exponent: 0 } },
		},
		500,
		"JPY",
	],
	[
		{
			currency: " usd ",
			balance: { credits: { amount_minor: 8871, exponent: 2 } },
		},
		88.71,
		"USD",
	],
])("normalizes observed prepaid schemas without confusing spend caps: %j", (body, amount, currency) => {
	expect(parseClaudePrepaidBalance(body, checkedAt)).toEqual({
		amount,
		currency,
		checkedAt,
	});
});

test.each([
	null,
	[[]],
	{},
	{ monthly_limit: 10000, used_credits: 100 },
	{ amount: "5597", currency: "USD" },
	{ amount: true, currency: "USD" },
	{ amount: -1, currency: "USD" },
	{ amount: Infinity, currency: "USD" },
	{ amount: Number.NaN, currency: "USD" },
	{ amount: 100 },
	{ amount: 100, currency: "" },
	{ amount: 100, currency: "dollars" },
	{ amount: 100, currency: "XYZ" },
	{ amount: 100, currency: "JPY" },
	{ amount: 100, currency: "BHD" },
	{ amount: 100, currency: 123 },
	{ amount: 100, currency: "USD", balance: [] },
	{ amount: 100, currency: "USD", balance: { money: false } },
	{ amount: 100, currency: "USD", balance: { credits: "100" } },
	{ amount: 100, currency: "USD", balance: { money: { exponent: -1 } } },
	{ amount: 100, currency: "USD", balance: { money: { exponent: 0.5 } } },
	{ amount: 100, currency: "USD", balance: { money: { exponent: 100 } } },
	{ amount: 100, currency: "USD", balance: { money: { exponent: "2" } } },
	{ amount: 100, currency: "USD", balance: { money: { currency: "EUR" } } },
	{ amount: 100, currency: "USD", balance: { money: { amount_minor: 200 } } },
])("malformed or contradictory wallet data stays unavailable: %j", (body) => {
	expect(parseClaudePrepaidBalance(body, checkedAt)).toBeUndefined();
});

test("wallet 429 retains its exact owner balance and original date without pausing usage", async () => {
	let at = checkedAt.getTime(),
		calls = 0;
	const requests = createClaudeRequestClient({
		store: createQuotaCooldownStore(undefined, () => at),
		now: () => at,
		random: () => 0,
		fetcher: async () => {
			calls++;
			return calls === 1
				? Response.json({ amount: 8871, currency: "USD" })
				: new Response(null, {
						status: 429,
						headers: { "Retry-After": "600" },
					});
		},
	});
	const wallet = createClaudePrepaidReader({
		request: requests.request,
		now: () => at,
	});
	const signal = new AbortController().signal;
	const first = await wallet.fetch("wallet-fixture", profile, signal);
	expect(first).toEqual({ amount: 88.71, currency: "USD", checkedAt });
	at += 30 * 60_000;
	expect(await wallet.fetch("wallet-fixture", profile, signal)).toEqual(first);
	expect(calls).toBe(2);
	at += 30_000;
	expect(await wallet.fetch("wallet-fixture", profile, signal)).toEqual(first);
	expect(calls).toBe(2);
	expect(wallet.peek("other-token", profile)).toBeUndefined();
	expect(
		wallet.peek("wallet-fixture", { account: profile.account }),
	).toBeUndefined();
	at += 31_000;
	expect(wallet.peek("wallet-fixture", profile)).toBeUndefined();
});

test("wallet denial and explicit currencyless zero remain distinct", async () => {
	for (const status of [200, 403]) {
		const requests = createClaudeRequestClient({
			store: createQuotaCooldownStore(),
			fetcher: async () =>
				status === 200
					? Response.json({ amount: 0, currency: null, balance: null })
					: new Response(null, { status }),
		});
		const wallet = createClaudePrepaidReader({ request: requests.request });
		const result = await wallet.fetch(
			`wallet-zero-${status}`,
			profile,
			new AbortController().signal,
		);
		if (status === 200)
			expect(result).toMatchObject({ amount: 0, currency: null });
		else expect(result).toBeUndefined();
	}
});
