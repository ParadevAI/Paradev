import { expect, test } from "bun:test";
import { createCredentialQuotaCache } from "./credential-quota-cache";
import { copyQuotaRetry, recordQuotaRetry } from "./quota-backoff";
import { unavailableQuotaAccount } from "./quota-credentials";
import type { UsageAccount } from "./types";
import { createUsageQuotaReader } from "./usage-quota";

const account = (agent: "claude" | "codex", value = 20): UsageAccount => ({
	...unavailableQuotaAccount({
		agent,
		accountKey: agent,
		sourceLabel: agent,
		selection: null,
	}),
	status: "ok",
	statusDetail: null,
	windows: [
		{ id: "session", label: "Session", usedPercent: value, resetsAt: null },
	],
});

test("provider rejection cannot erase a healthy provider or claim a logout", async () => {
	let reads = 0;
	const reader = createUsageQuotaReader([
		{
			agent: "claude",
			capture: async () => {
				throw new Error("private-reader-error");
			},
		},
		{
			agent: "codex",
			capture: async () => ({
				revision: "codex",
				load: async () => {
					reads++;
					return [account("codex")];
				},
			}),
		},
	]);
	const first = await reader.get();
	expect(first.map((item) => item.status)).toEqual(["unavailable", "ok"]);
	expect(first[0]?.discoveryFailed).toBe(true);
	expect(first[0]).not.toHaveProperty("quotaIdentity");
	expect(JSON.stringify(first)).not.toContain("private-reader-error");
	await reader.get(true);
	expect(reads).toBe(1);
});

test("surfaces share force cooldown, five-minute polling and independent credential revisions", async () => {
	let now = 0,
		claudeLoads = 0,
		codexLoads = 0,
		codexRevision = "A";
	const reader = createUsageQuotaReader(
		[
			{
				agent: "claude",
				capture: async () => ({
					revision: "claude",
					load: async () => {
						claudeLoads++;
						return [account("claude")];
					},
				}),
			},
			{
				agent: "codex",
				capture: async () => ({
					revision: codexRevision,
					load: async () => {
						codexLoads++;
						return [account("codex")];
					},
				}),
			},
		],
		() => now,
	);
	await reader.get();
	await Promise.all([reader.get(true), reader.get(), reader.get(true)]);
	expect([claudeLoads, codexLoads]).toEqual([1, 1]);
	now = 29_999;
	await reader.get(true);
	expect([claudeLoads, codexLoads]).toEqual([1, 1]);
	codexRevision = "B";
	await reader.get();
	expect([claudeLoads, codexLoads]).toEqual([1, 2]);
	now = 30_000;
	await reader.get(true);
	expect([claudeLoads, codexLoads]).toEqual([2, 2]);
	now = 329_998;
	await reader.get();
	expect([claudeLoads, codexLoads]).toEqual([2, 2]);
	now = 330_000;
	await reader.get();
	expect([claudeLoads, codexLoads]).toEqual([3, 3]);
});

test("failed provider force reads have shared bounded exponential backoff", async () => {
	let now = 0,
		loads = 0;
	const reader = createUsageQuotaReader(
		[
			{
				agent: "claude",
				capture: async () => ({
					revision: "A",
					load: async () => {
						loads++;
						return [{ ...account("claude"), status: "unavailable" }];
					},
				}),
			},
		],
		() => now,
	);
	await reader.get();
	now = 29_999;
	await reader.get(true);
	expect(loads).toBe(1);
	now = 30_000;
	await reader.get(true);
	expect(loads).toBe(2);
	now = 89_999;
	await reader.get(true);
	expect(loads).toBe(2);
	now = 90_000;
	await reader.get(true);
	expect(loads).toBe(3);
});

test("one account Retry-After survives sibling credential rotation while healthy siblings refresh", async () => {
	let now = 0,
		aLoads = 0,
		bLoads = 0,
		bToken = "B1";
	const credentials = createCredentialQuotaCache<UsageAccount>(
		300_000,
		() => now,
	);
	const limited = copyQuotaRetry(
		recordQuotaRetry(
			account("claude"),
			new Response("", { status: 429, headers: { "Retry-After": "600" } }),
		),
		{ ...account("claude"), status: "unavailable" as const },
	);
	const reader = createUsageQuotaReader(
		[
			{
				agent: "claude",
				capture: async () => {
					const capturedB = bToken;
					return {
						revision: capturedB,
						load: async (force = false) =>
							Promise.all([
								credentials.get(
									"A",
									async () => {
										aLoads++;
										return limited;
									},
									force,
								),
								credentials.get(
									capturedB,
									async () => {
										bLoads++;
										return account("claude");
									},
									force,
								),
							]),
					};
				},
			},
		],
		() => now,
	);
	await reader.get();
	expect([aLoads, bLoads]).toEqual([1, 1]);
	now = 1;
	bToken = "B2";
	await reader.get(true);
	expect([aLoads, bLoads]).toEqual([1, 2]);
	now = 30_001;
	await reader.get(true);
	expect([aLoads, bLoads]).toEqual([1, 3]);
	now = 599_999;
	await reader.get(true);
	expect([aLoads, bLoads]).toEqual([1, 4]);
	now = 630_000;
	await reader.get(true);
	expect([aLoads, bLoads]).toEqual([2, 5]);
	expect(JSON.stringify(limited)).not.toContain("retry");
});

test("sibling rotation does not extend another account's original five-minute observation lifetime", async () => {
	let now = 0,
		aLoads = 0,
		bToken = "B1";
	const credentials = createCredentialQuotaCache<UsageAccount>(
		300_000,
		() => now,
	);
	const reader = createUsageQuotaReader(
		[
			{
				agent: "claude",
				capture: async () => {
					const captured = bToken;
					return {
						revision: captured,
						load: async (force = false) =>
							Promise.all([
								credentials.get(
									"A",
									async () => {
										aLoads++;
										return { ...account("claude"), fetchedAt: new Date(now) };
									},
									force,
								),
								credentials.get(
									captured,
									async () => ({
										...account("claude"),
										fetchedAt: new Date(now),
									}),
									force,
								),
							]),
					};
				},
			},
		],
		() => now,
	);
	const first = await reader.get();
	now = 240_000;
	bToken = "B2";
	const rotated = await reader.get();
	expect(rotated[0]?.fetchedAt).toBe(first[0]?.fetchedAt);
	expect(aLoads).toBe(1);
	now = 300_000;
	await reader.get();
	expect(aLoads).toBe(2);
});

test("a provider completion refreshes its placeholder and disposal unsubscribes owned work", async () => {
	let completed: (() => void) | undefined;
	let loads = 0,
		unsubscribed = 0,
		disposed = 0;
	const reader = createUsageQuotaReader([
		{
			agent: "claude",
			subscribe: (listener) => {
				completed = listener;
				return () => {
					unsubscribed++;
				};
			},
			dispose: async () => {
				disposed++;
			},
			capture: async () => ({
				revision: "same-owner",
				load: async () => {
					loads++;
					return [account("claude", loads)];
				},
			}),
		},
	]);
	expect((await reader.get())[0]?.windows[0]?.usedPercent).toBe(1);
	completed?.();
	expect((await reader.get())[0]?.windows[0]?.usedPercent).toBe(2);
	await reader.dispose();
	expect([unsubscribed, disposed]).toEqual([1, 1]);
});

test("native completion refreshes the shared snapshot without relabeling HTTP or wallet dates", async () => {
	let now = 1_800_000_000_000;
	const httpAt = new Date(now - 20 * 60_000);
	const walletAt = new Date(now - 25 * 60_000);
	let loads = 0;
	let changed: (() => void) | undefined;
	let disposed = false;
	const reader = createUsageQuotaReader(
		[
			{
				agent: "claude",
				subscribe: (listener) => {
					changed = listener;
					return () => {
						disposed = true;
					};
				},
				capture: async () => ({
					revision: "same-native-owner",
					load: async () => {
						loads++;
						return [
							{
								...account("claude"),
								fetchedAt: httpAt,
								prepaidBalance: {
									amount: 10,
									currency: "USD",
									checkedAt: walletAt,
								},
								windows: [
									{
										id: "five_hour",
										label: "Session (5h)",
										usedPercent: 20,
										resetsAt: new Date(now + 60 * 60_000),
										observedAt: new Date(now),
										source: "claude_statusline" as const,
									},
								],
							},
						];
					},
				}),
			},
		],
		() => now,
	);
	await reader.get();
	now += 60_000;
	const same = await reader.get();
	expect(loads).toBe(1);
	expect(same[0]?.fetchedAt).toBe(httpAt);
	expect(same[0]?.prepaidBalance?.checkedAt).toBe(walletAt);
	changed?.();
	const refreshed = await reader.get();
	expect(loads).toBe(2);
	expect(refreshed[0]?.fetchedAt).toBe(httpAt);
	expect(refreshed[0]?.windows[0]?.observedAt).toEqual(new Date(now));
	await reader.dispose();
	expect(disposed).toBe(true);
});

test("per-provider inventory timing expires only the short-lived provider", async () => {
	let now = 0;
	const calls = { claude: 0, codex: 0 };
	const reader = createUsageQuotaReader(
		(["claude", "codex"] as const).map((agent) => ({
			agent,
			ttlMs: agent === "claude" ? 60_000 : 300_000,
			capture: async () => ({
				revision: agent,
				load: async () => {
					calls[agent]++;
					return [{ ...account(agent), fetchedAt: new Date(now) }];
				},
			}),
		})),
		() => now,
	);
	await reader.get();
	now = 60_000;
	await reader.get();
	expect(calls).toEqual({ claude: 2, codex: 1 });
	reader.expire("claude");
	await reader.get();
	expect(calls).toEqual({ claude: 3, codex: 1 });
	await reader.dispose();
});
