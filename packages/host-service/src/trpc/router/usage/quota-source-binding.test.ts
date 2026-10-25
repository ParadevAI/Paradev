import { expect, test } from "bun:test";
import {
	fetchCodexAccountForHome,
	fetchCodexSubscriptionQuota,
	mapCodexQuotaWindows,
} from "./codex";
import { createQuotaRequestBudget } from "./quota-request";
import { createQuotaRateLimitGate } from "./quota-widget-metadata";

const windows = [
	{
		id: "five_hour",
		label: "Session",
		usedPercent: 20,
		resetsAt: new Date("2026-10-16T00:00:00Z"),
	},
];
const metadata = {
	quotaIdentity: "synthetic-verified-owner",
	resetCredits: { availableCount: 2, expirations: null, checkedAt: new Date() },
};

test("Codex source is checked after network reads and API credentials are never opened", async () => {
	const home = {
		home: "/synthetic/codex",
		sourceLabel: "Synthetic",
		credentialKind: "subscription" as const,
		loginFingerprint: null,
	};
	const auth = JSON.stringify({
		tokens: {
			access_token: "synthetic-token",
			account_id: "synthetic-account",
		},
	});
	let reads = 0;
	const quota = async () => ({
		email: "synthetic@example.test",
		plan: "pro",
		status: "ok" as const,
		statusDetail: null,
		windows,
		creditsBalance: null,
		...metadata,
	});
	const [changed] = await fetchCodexAccountForHome(
		home,
		false,
		async () =>
			++reads === 1
				? auth
				: JSON.stringify({
						tokens: {
							access_token: "changed-token",
							account_id: "other-account",
						},
					}),
		quota,
	);
	expect(reads).toBe(2);
	expect(changed?.status).toBe("unavailable");
	expect(changed?.windows).toEqual([]);
	expect(changed?.quotaIdentity).toBeUndefined();
	let opened = false;
	await fetchCodexAccountForHome(
		{ ...home, credentialKind: "api_key" },
		false,
		async () => {
			opened = true;
			throw new Error("must not read API key");
		},
		quota,
	);
	expect(opened).toBe(false);
});

test("Codex primary-window duration identifies weekly-only accounts without guessing a session", () => {
	const [weekly] = mapCodexQuotaWindows({
		rate_limit: {
			primary_window: {
				used_percent: 40,
				limit_window_seconds: 604_800,
				reset_at: 1_800_000_000,
			},
		},
	});
	expect(weekly?.id).toBe("primary");
	expect(weekly?.windowSeconds).toBe(604_800);
	const [unknown] = mapCodexQuotaWindows({
		rate_limit: { primary_window: { used_percent: 40 } },
	});
	expect(unknown?.windowSeconds).toBeUndefined();
	expect(
		mapCodexQuotaWindows({
			rate_limit: { primary_window: { used_percent: Number.NaN } },
		}),
	).toEqual([]);
});

test("Codex invalid durations stay generic instead of creating a session limit", () => {
	for (const seconds of [undefined, null, 0, -3600, NaN, Infinity, -Infinity]) {
		const window = { used_percent: 20 };
		Reflect.set(window, "limit_window_seconds", seconds);
		expect(
			mapCodexQuotaWindows({ rate_limit: { primary_window: window } })[0]
				?.label,
		).toBe("Limit");
	}
});

test("Codex quota labels use exact session and weekly duration boundaries", () => {
	for (const [seconds, label] of [
		[3600, "Session (1h)"],
		[18_000, "Session (5h)"],
		[18_001, "5h"],
		[21_600, "6h"],
		[86_400, "1d"],
		[604_799, "7d"],
		[604_800, "Weekly"],
	] as const) {
		expect(
			mapCodexQuotaWindows({
				rate_limit: {
					primary_window: { used_percent: 20, limit_window_seconds: seconds },
				},
			})[0]?.label,
		).toBe(label);
	}
});

test("a valid Codex quota survives when no shared deadline remains for optional resets", async () => {
	let clock = 0;
	let optionalCalls = 0;
	const quota = await fetchCodexSubscriptionQuota(
		"synthetic-token",
		"synthetic-account",
		async () => {
			clock = 8_000;
			return new Response(
				JSON.stringify({
					account_id: "synthetic-account",
					email: "synthetic@example.test",
					plan_type: "pro",
					rate_limit: {
						primary_window: { used_percent: 30, limit_window_seconds: 18_000 },
					},
				}),
			);
		},
		createQuotaRequestBudget(8_000, () => clock),
		async () => {
			optionalCalls++;
			throw new Error("optional failure");
		},
		createQuotaRateLimitGate(() => clock),
	);
	expect(quota.status).toBe("ok");
	expect(quota.windows[0]?.usedPercent).toBe(30);
	expect(quota.resetCredits).toBeUndefined();
	expect(optionalCalls).toBe(0);
});

test("Codex primary quota Retry-After cannot be bypassed by a new explicit read", async () => {
	let clock = 0;
	let calls = 0;
	const gate = createQuotaRateLimitGate(() => clock);
	const fetcher = async () => {
		calls++;
		return new Response("", {
			status: 429,
			headers: { "retry-after": "3600" },
		});
	};
	await fetchCodexSubscriptionQuota(
		"synthetic-token",
		"synthetic-account",
		fetcher,
		createQuotaRequestBudget(),
		async () => undefined,
		gate,
	);
	clock = 300_001;
	expect(
		(
			await fetchCodexSubscriptionQuota(
				"synthetic-token",
				"synthetic-account",
				fetcher,
				createQuotaRequestBudget(),
				async () => undefined,
				gate,
			)
		).status,
	).toBe("unavailable");
	expect(calls).toBe(1);
});

test("Codex network reader preserves the main reset count when optional details fail or disagree", async () => {
	const main = async () =>
		new Response(
			JSON.stringify({
				account_id: "synthetic-account",
				email: "synthetic@example.test",
				plan_type: "pro",
				rate_limit: {
					primary_window: { used_percent: 30, limit_window_seconds: 18_000 },
				},
				rate_limit_reset_credits: { available_count: 2 },
			}),
		);
	const failed = await fetchCodexSubscriptionQuota(
		"synthetic-token",
		"synthetic-account",
		main,
		createQuotaRequestBudget(),
		async () => {
			throw new Error("optional details unavailable");
		},
		createQuotaRateLimitGate(),
	);
	expect(failed.status).toBe("ok");
	expect(failed.resetCredits?.availableCount).toBe(2);
	expect(failed.resetCredits?.expirations).toBeNull();
	const mismatch = await fetchCodexSubscriptionQuota(
		"synthetic-token",
		"synthetic-account",
		main,
		createQuotaRequestBudget(),
		async () => ({
			availableCount: 3,
			expirations: [null, null, null],
			checkedAt: new Date(),
		}),
		createQuotaRateLimitGate(),
	);
	expect(mismatch.resetCredits?.availableCount).toBe(2);
	expect(mismatch.resetCredits?.expirations).toBeNull();
});

test("Codex network reader skips optional details for an explicit zero main reset count", async () => {
	let calls = 0;
	const value = await fetchCodexSubscriptionQuota(
		"synthetic-token",
		"synthetic-account",
		async () =>
			new Response(
				JSON.stringify({
					account_id: "synthetic-account",
					plan_type: "pro",
					rate_limit: {
						primary_window: { used_percent: 30, limit_window_seconds: 18_000 },
					},
					rate_limit_reset_credits: { available_count: 0 },
				}),
			),
		createQuotaRequestBudget(),
		async () => {
			calls++;
			return undefined;
		},
		createQuotaRateLimitGate(),
	);
	expect(value.status).toBe("ok");
	expect(value.resetCredits?.availableCount).toBe(0);
	expect(calls).toBe(0);
});
