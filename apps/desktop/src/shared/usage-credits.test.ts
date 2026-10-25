import { expect, test } from "bun:test";
import {
	CREDIT_DISPLAY_AGE_MS,
	creditBalanceReading,
	formatCreditBalance,
} from "./usage-credits";

const now = Date.parse("2026-10-25T12:00:00Z");
const account = {
	status: "ok",
	creditsBalance: null,
	checkedAt: new Date(now),
	prepaidBalance: {
		amount: 12.34,
		currency: "USD",
		checkedAt: new Date(now - 5 * 60_000),
	},
};
test("prepaid money keeps its currency and own timestamp; zero is a real balance", () => {
	const reading = creditBalanceReading(account, false, now);
	expect(reading?.checkedAt.getTime()).toBe(now - 5 * 60_000);
	if (!reading) throw new Error("Expected prepaid reading");
	expect(formatCreditBalance(reading, "en-US")).toBe("$12.34");
	expect(() => formatCreditBalance(reading, "")).not.toThrow();
	expect(() => formatCreditBalance(reading, "not a locale")).not.toThrow();
	expect(
		creditBalanceReading(
			{ ...account, prepaidBalance: { ...account.prepaidBalance, amount: 0 } },
			false,
			now,
		)?.amount,
	).toBe(0);
	expect(
		creditBalanceReading({ ...account, prepaidBalance: undefined }, false, now),
	).toBeNull();
});
test("fresh quota or native data cannot extend the wallet age", () => {
	expect(
		creditBalanceReading(
			{
				...account,
				prepaidBalance: {
					...account.prepaidBalance,
					checkedAt: new Date(now - CREDIT_DISPLAY_AGE_MS - 1),
				},
			},
			false,
			now,
		),
	).toBeNull();
	expect(
		creditBalanceReading(
			{
				...account,
				prepaidBalance: {
					...account.prepaidBalance,
					checkedAt: new Date(now - 30 * 60_000 - 1),
				},
			},
			false,
			now,
		)?.fresh,
	).toBe(false);
	expect(creditBalanceReading(account, true, now)?.fresh).toBe(false);
});
test("changed owners, sign-outs, invalid amounts/currencies and future observations are refused", () => {
	for (const patch of [
		{ identityChanged: true },
		{ status: "signed_out" },
		{ status: "token_expired" },
		{ prepaidBalance: { ...account.prepaidBalance, amount: NaN } },
		{ prepaidBalance: { ...account.prepaidBalance, amount: -1 } },
		{ prepaidBalance: { ...account.prepaidBalance, currency: "invalid" } },
		{
			prepaidBalance: {
				...account.prepaidBalance,
				checkedAt: new Date(now + 60_001),
			},
		},
	])
		expect(
			creditBalanceReading({ ...account, ...patch }, false, now),
		).toBeNull();
});
test("provider credits stay credits and do not invent a wallet currency", () => {
	const reading = creditBalanceReading(
		{ ...account, prepaidBalance: undefined, creditsBalance: 5.75 },
		false,
		now,
	);
	expect(reading?.kind).toBe("credits");
	expect(reading?.currency).toBeNull();
	if (!reading) throw new Error("Expected provider credits");
	expect(formatCreditBalance(reading, "en-US")).toBe("5.75");
});
