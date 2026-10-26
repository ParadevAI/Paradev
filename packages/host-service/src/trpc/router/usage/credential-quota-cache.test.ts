import { expect, test } from "bun:test";
import { createCredentialQuotaCache } from "./credential-quota-cache";
import { recordQuotaRetry } from "./quota-backoff";

test("active cadence refreshes earlier, idle cadence reuses readings, and aliases keep server cooldowns", async () => {
	let now = 0,
		loads = 0;
	const cache = createCredentialQuotaCache<{ observedAt: number }>(
		600_000,
		() => now,
	);
	const load = async () => ({ observedAt: ++loads });
	const first = await cache.get("idle", load, false, "token", 600_000);
	now = 120_000;
	expect(await cache.get("idle", load, false, "token", 600_000)).toBe(first);
	expect(cache.fresh("token", 120_000)).toBe(false);
	expect(await cache.get("active", load, false, "token", 120_000)).toEqual({
		observedAt: 2,
	});
	const limited = recordQuotaRetry(
		{ observedAt: 3 },
		new Response("", { status: 429, headers: { "retry-after": "600" } }),
	);
	await cache.get("active", async () => limited, true, "token", 120_000);
	now += 599_999;
	expect(await cache.get("alias", load, true, "token", 1)).toBe(limited);
	expect(loads).toBe(2);
	expect(cache.fresh("token", 1)).toBe(true);
	now++;
	await cache.get("alias", load, false, "token", 120_000);
	expect(loads).toBe(3);
});

test("profile aliases cannot bypass one transport credential's absolute Retry-After", async () => {
	let now = 0,
		loads = 0;
	const cache = createCredentialQuotaCache<{
		status: string;
		windows: number[];
	}>(300_000, () => now);
	const limited = recordQuotaRetry(
		{ status: "unavailable", windows: [] },
		new Response("", { status: 429, headers: { "Retry-After": "600" } }),
	);
	const load = async () => {
		loads++;
		return limited;
	};
	await cache.get("profileA-token", load, true, "token");
	now = 30_000;
	expect(await cache.get("aliasB-token", load, true, "token")).toBe(limited);
	expect(loads).toBe(1);
	const unrelated = await cache.get(
		"profileC-other",
		async () => ({ status: "ok", windows: [25] }),
		true,
		"other-token",
	);
	expect(unrelated.status).toBe("ok");
	now = 600_000;
	await cache.get("aliasB-token", load, true, "token");
	expect(loads).toBe(2);
});
test("a failed loader is released without poisoning the cached credential result", async () => {
	const cache = createCredentialQuotaCache<{ status: string }>();
	let loads = 0;
	const load = async () => {
		loads++;
		throw new Error("private-error");
	};
	await expect(cache.get("test", load)).rejects.toThrow("private-error");
	expect(await cache.get("test", async () => ({ status: "ok" }))).toEqual({
		status: "ok",
	});
	expect(loads).toBe(1);
});

test("concurrent profile aliases share the actual transport request and retain its observed timestamp", async () => {
	let loads = 0;
	let finish!: (value: { status: string; fetchedAt: Date }) => void;
	const response = new Promise<{ status: string; fetchedAt: Date }>(
		(resolve) => {
			finish = resolve;
		},
	);
	const cache = createCredentialQuotaCache<{
		status: string;
		fetchedAt: Date;
	}>();
	const load = () => {
		loads++;
		return response;
	};
	const a = cache.get("profile-a", load, false, "same-token");
	const b = cache.get("profile-b", load, false, "same-token");
	const value = { status: "ok", fetchedAt: new Date(1234) };
	finish(value);
	expect(await a).toBe(value);
	expect(await b).toBe(value);
	expect(await cache.get("profile-b", load, false, "same-token")).toBe(value);
	expect(loads).toBe(1);
});

test("repeated rate limits back off once per actual request and never delay healthy siblings", async () => {
	let now = 0;
	let limitedLoads = 0;
	const cache = createCredentialQuotaCache<{ status: string }>(
		300_000,
		() => now,
		() => 0,
	);
	const load = async () => {
		limitedLoads++;
		return recordQuotaRetry(
			{ status: "unavailable" },
			new Response("", { status: 429 }),
		);
	};
	await Promise.all(
		["a", "b", "c"].map((key) => cache.get(key, load, true, "limited")),
	);
	expect(limitedLoads).toBe(1);
	now = 299_999;
	await cache.get("new-alias", load, true, "limited");
	expect(limitedLoads).toBe(1);
	now = 300_000;
	await cache.get("a", load, true, "limited");
	expect(limitedLoads).toBe(2);
	now = 899_999;
	await cache.get("b", load, true, "limited");
	expect(limitedLoads).toBe(2);
	expect(
		await cache.get("healthy", async () => ({ status: "ok" }), true),
	).toEqual({ status: "ok" });
	now = 900_000;
	await cache.get("c", load, true, "limited");
	expect(limitedLoads).toBe(3);
});

test("replaying one response through late aliases does not slide its absolute server deadline", async () => {
	let now = 0;
	let loads = 0;
	const cache = createCredentialQuotaCache<object>(
		0,
		() => now,
		() => 0,
	);
	const limited = recordQuotaRetry(
		{},
		new Response("", { status: 429, headers: { "retry-after": "600" } }),
	);
	const load = async () => {
		loads++;
		return limited;
	};
	await cache.get("a", load, true, "token");
	now = 500_000;
	await cache.get("b", load, true, "token");
	expect(loads).toBe(1);
	now = 600_000;
	await cache.get("b", load, true, "token");
	expect(loads).toBe(2);
	now = 600_001;
	await cache.get("c", load, true, "token");
	expect(loads).toBe(3);
});

test("exponential jitter is bounded and a successful result resets the failure sequence", async () => {
	let now = 0;
	let loads = 0;
	let healthy = false;
	const cache = createCredentialQuotaCache<{ status: string }>(
		0,
		() => now,
		() => 1,
	);
	const load = async () => {
		loads++;
		return healthy
			? { status: "ok" }
			: recordQuotaRetry(
					{ status: "unavailable" },
					new Response("", { status: 503 }),
				);
	};
	await cache.get("a", load, true);
	now = 30_000;
	await cache.get("a", load, true);
	now = 101_999;
	await cache.get("a", load, true);
	expect(loads).toBe(2);
	now = 102_000;
	healthy = true;
	await cache.get("a", load, true);
	expect(loads).toBe(3);
	healthy = false;
	await cache.get("a", load, true);
	now += 29_999;
	await cache.get("a", load, true);
	expect(loads).toBe(4);
	now += 1;
	await cache.get("a", load, true);
	expect(loads).toBe(5);
});

test("repeated failures cap automatic retry delay while retaining longer provider instructions", async () => {
	let now = 0;
	let loads = 0;
	const cache = createCredentialQuotaCache<object>(
		0,
		() => now,
		() => 1,
	);
	const load = async () => {
		loads++;
		return recordQuotaRetry({}, new Response("", { status: 429 }));
	};
	for (let attempt = 0; attempt < 9; attempt++) {
		await cache.get("limited", load, true);
		now += 30 * 60_000;
	}
	expect(loads).toBe(9);
	await cache.get("limited", load, true);
	expect(loads).toBe(10);
	const longPause = async () => {
		loads++;
		return recordQuotaRetry(
			{},
			new Response("", { status: 503, headers: { "retry-after": "7200" } }),
		);
	};
	await cache.get("long", longPause, true);
	now += 119 * 60_000;
	await cache.get("long", longPause, true);
	expect(loads).toBe(11);
	now += 60_000;
	await cache.get("long", longPause, true);
	expect(loads).toBe(12);
});

test("renewal can inspect the same transport pause without extending or bypassing it", async () => {
	let now = 0;
	let loads = 0;
	const cache = createCredentialQuotaCache<object>(
		0,
		() => now,
		() => 0,
	);
	const load = async () => {
		loads++;
		return recordQuotaRetry(
			{},
			new Response("", { status: 429, headers: { "retry-after": "600" } }),
		);
	};
	expect(cache.retryAt("token")).toBe(0);
	await cache.get("profile", load, true, "token");
	expect(cache.retryAt("token")).toBe(600_000);
	now = 300_000;
	expect(cache.retryAt("token")).toBe(600_000);
	await cache.get("alias", load, true, "token");
	expect(loads).toBe(1);
	expect(cache.retryAt("token")).toBe(600_000);
	now = 600_000;
	await cache.get("profile", async () => ({}), true, "token");
	expect(cache.retryAt("token")).toBe(0);
});

test("a concurrent alias follower cannot extend the original absolute Retry-After deadline", async () => {
	let now = 0;
	let release!: () => void;
	const gate = new Promise<void>((done) => {
		release = done;
	});
	let requests = 0;
	const cache = createCredentialQuotaCache(300_000, () => now);
	const load = async () => {
		requests++;
		await gate;
		return recordQuotaRetry({}, new Response("", { status: 429 }));
	};
	const owner = cache.get("owner", load, true, "transport");
	void owner.then(() => {
		now = 100_000;
	});
	const follower = cache.get("follower", load, true, "transport");
	release();
	await Promise.all([owner, follower]);
	now = 300_001;
	await cache.get("follower", load, true, "transport");
	expect(requests).toBe(2);
});

test("invalidating exact transport authority fences an old result without erasing a replacement", async () => {
	const cache = createCredentialQuotaCache<{ status: string }>();
	const old = Promise.withResolvers<{ status: string }>();
	const first = cache.get("old", () => old.promise, false, "token");
	await Promise.resolve();
	cache.invalidate("token");
	expect(
		await cache.get(
			"new",
			async () => ({ status: "new-owner" }),
			false,
			"token",
		),
	).toEqual({ status: "new-owner" });
	old.resolve({ status: "stale-owner" });
	await expect(first).rejects.toThrow("changed");
	expect(cache.peek("token")?.value).toEqual({ status: "new-owner" });
});
