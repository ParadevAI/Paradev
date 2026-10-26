import { expect, test } from "bun:test";
import {
	createQuotaRateLimitGate,
	createResetMetadataReader,
	opaqueQuotaIdentity,
	type QuotaFetch,
} from "./quota-widget-metadata";

const time = Date.parse("2026-10-15T12:00:00Z");
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

test("Codex reset metadata shares one account-scoped read and keeps a known count when detail is absent", async () => {
	let calls = 0;
	const deadlines: number[] = [];
	const fetcher: QuotaFetch = async (url, options) => {
		calls++;
		expect(String(url)).toBe(
			"https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
		);
		const headers = new Headers(options?.headers);
		expect(headers.get("authorization")).toBe("Bearer test-token");
		expect(headers.get("chatgpt-account-id")).toBe("test-account");
		expect(headers.get("openai-beta")).toBe("codex-1");
		expect(options?.method).toBe("GET");
		expect(options?.cache).toBe("no-store");
		return json({ available_count: 3 });
	};
	const reader = createResetMetadataReader(
		fetcher,
		() => time,
		(limit) => {
			deadlines.push(limit);
			return new AbortController().signal;
		},
	);
	const [first, second] = await Promise.all([
		reader.codex("test-token", "test-account"),
		reader.codex("test-token", "test-account"),
	]);
	expect(calls).toBe(1);
	expect(deadlines).toEqual([2_000]);
	expect(first?.availableCount).toBe(3);
	expect(second).toEqual(first);
	expect(first?.expirations).toBeNull();
});

test("optional Codex reset failures stay unknown and are throttled independently per credential/account", async () => {
	let calls = 0;
	let clock = time;
	const reader = createResetMetadataReader(
		async () => {
			calls++;
			throw new Error("synthetic failure");
		},
		() => clock,
	);
	expect(await reader.codex("a", "one")).toBeUndefined();
	expect(await reader.codex("a", "one")).toBeUndefined();
	expect(calls).toBe(1);
	await reader.codex("a", "two");
	await reader.codex("b", "one");
	expect(calls).toBe(3);
	clock += 300_000;
	await reader.codex("a", "one");
	expect(calls).toBe(4);
});

test("Claude reset-query rejection falls back once with the same token and deadline", async () => {
	const calls: string[] = [];
	const signal = new AbortController().signal;
	const reader = createResetMetadataReader(
		async (url, options) => {
			calls.push(String(url));
			expect(new Headers(options?.headers).get("authorization")).toBe(
				"Bearer test-token",
			);
			expect(options?.signal).toBe(signal);
			return calls.length === 1
				? json({}, 403)
				: json({ five_hour: { utilization: 12 } });
		},
		() => time,
		() => signal,
	);
	const result = await reader.claude("test-token");
	expect(calls).toEqual([
		"https://api.anthropic.com/api/oauth/usage?cedar_ember=1",
		"https://api.anthropic.com/api/oauth/usage",
	]);
	expect(result.body).toEqual({ five_hour: { utilization: 12 } });
	expect(result.resetCredits?.availableCount).toBeNull();
});

test("Claude only refreshes reset inventory every five minutes and retains its original capture age", async () => {
	const calls: string[] = [];
	let clock = time;
	const reader = createResetMetadataReader(
		async (url) => {
			calls.push(String(url));
			return json({
				five_hour: { utilization: 12 },
				cedar_ember: {
					eligible: true,
					grants: [{ resets_left: 2, paused: false }],
				},
			});
		},
		() => clock,
	);
	const first = await reader.claude("test-token");
	clock += 30_000;
	const second = await reader.claude("test-token");
	expect(calls[0]).toContain("cedar_ember=1");
	expect(calls[1]).not.toContain("?");
	expect(first.resetCredits?.availableCount).toBe(2);
	expect(second.resetCredits?.checkedAt.getTime()).toBe(time);
});

test("auth and rate limits never trigger the compatibility retry; aborts never create reset counts", async () => {
	for (const status of [401, 429, 500]) {
		let calls = 0;
		const reader = createResetMetadataReader(
			async () => {
				calls++;
				return json({}, status);
			},
			() => time,
		);
		expect((await reader.claude("test-token")).status).toBe(status);
		expect(calls).toBe(1);
	}
	const controller = new AbortController();
	controller.abort();
	const reader = createResetMetadataReader(
		async (_url, options) => {
			options?.signal?.throwIfAborted();
			return json({ available_count: 2 });
		},
		() => time,
		() => controller.signal,
	);
	expect(await reader.codex("test-token", "test-account")).toBeUndefined();
	await expect(reader.claude("test-token")).rejects.toThrow();
});

test("opaque identity separates provider, source and verified account without exposing inputs", () => {
	const id = opaqueQuotaIdentity(
		"claude",
		"/synthetic/profile",
		"owner@example.test",
	);
	expect(id).toMatch(/^[a-f0-9]{64}$/);
	expect(id).not.toContain("owner");
	expect(id).not.toBe(
		opaqueQuotaIdentity("codex", "/synthetic/profile", "owner@example.test"),
	);
	expect(id).not.toBe(
		opaqueQuotaIdentity("claude", "/synthetic/other", "owner@example.test"),
	);
	expect(id).not.toBe(
		opaqueQuotaIdentity("claude", "/synthetic/profile", "other@example.test"),
	);
});

test("reset endpoint Retry-After survives the five-minute cadence and cannot leak between accounts", async () => {
	let clock = time;
	let calls = 0;
	const reader = createResetMetadataReader(
		async () => {
			calls++;
			return new Response("", {
				status: 429,
				headers: { "retry-after": "3600" },
			});
		},
		() => clock,
	);
	await reader.codex("test-token", "one");
	clock += 300_001;
	await reader.codex("test-token", "one");
	expect(calls).toBe(1);
	await reader.codex("test-token", "two");
	expect(calls).toBe(2);
	clock += 3_600_000;
	await reader.codex("test-token", "one");
	expect(calls).toBe(3);
});

test("Claude usage Retry-After is respected by ordinary and explicit repeated reads", async () => {
	let clock = time;
	let calls = 0;
	const reader = createResetMetadataReader(
		async () => {
			calls++;
			return new Response("", {
				status: 429,
				headers: { "retry-after": new Date(time + 3_600_000).toUTCString() },
			});
		},
		() => clock,
	);
	expect((await reader.claude("test-token")).status).toBe(429);
	clock += 300_001;
	expect((await reader.claude("test-token")).status).toBe(429);
	expect(calls).toBe(1);
});

test("invalid Retry-After has a bounded fallback and far-future headers do not block forever", () => {
	let clock = time;
	const gate = createQuotaRateLimitGate(() => clock);
	gate.record(
		"one",
		new Response("", { status: 429, headers: { "retry-after": "bad" } }),
	);
	gate.record(
		"two",
		new Response("", {
			status: 429,
			headers: { "retry-after": "999999999999999" },
		}),
	);
	clock += 300_000;
	expect(gate.blocked("one")).toBe(false);
	expect(gate.blocked("two")).toBe(true);
	clock += 24 * 60 * 60_000;
	expect(gate.blocked("two")).toBe(false);
});

test("254 accounts cannot evict the first account's active optional-endpoint backoff", async () => {
	let clock = time;
	let calls = 0;
	const reader = createResetMetadataReader(
		async () => {
			calls++;
			return new Response("", {
				status: 429,
				headers: { "retry-after": "3600" },
			});
		},
		() => clock,
	);
	for (let index = 0; index < 254; index++)
		await reader.codex(`synthetic-${index}`, `account-${index}`);
	clock += 300_001;
	await reader.codex("synthetic-0", "account-0");
	expect(calls).toBe(254);
});

test("capacity fails closed instead of evicting an active Retry-After gate", () => {
	let clock = time;
	const gate = createQuotaRateLimitGate(() => clock);
	const limited = new Response("", {
		status: 429,
		headers: { "retry-after": "3600" },
	});
	for (let index = 0; index < 5_000; index++)
		gate.record(`scope-${index}`, limited);
	gate.record("overflow", limited);
	expect(gate.blocked("scope-0")).toBe(true);
	expect(gate.blocked("overflow")).toBe(true);
	expect(gate.blocked("another-new-scope")).toBe(true);
	clock += 3_600_001;
	expect(gate.blocked("scope-0")).toBe(false);
	expect(gate.blocked("another-new-scope")).toBe(false);
});

test("a reader created before a fetch replacement uses the active transport at request time", async () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
	let initialCalls = 0;
	let activeCalls = 0;
	try {
		Object.defineProperty(globalThis, "fetch", {
			configurable: true,
			writable: true,
			value: async () => {
				initialCalls++;
				return json({ available_count: 1 });
			},
		});
		const reader = createResetMetadataReader(undefined, () => time);
		Object.defineProperty(globalThis, "fetch", {
			configurable: true,
			writable: true,
			value: async () => {
				activeCalls++;
				return json({ available_count: 3 });
			},
		});
		expect(
			(await reader.codex("fixture-lazy-fetch", "fixture-account"))
				?.availableCount,
		).toBe(3);
		expect(initialCalls).toBe(0);
		expect(activeCalls).toBe(1);
	} finally {
		if (descriptor) Object.defineProperty(globalThis, "fetch", descriptor);
	}
});
