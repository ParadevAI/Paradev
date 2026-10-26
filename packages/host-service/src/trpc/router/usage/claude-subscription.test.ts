import { expect, test } from "bun:test";
import { createClaudeLastKnownStore } from "./claude-last-known";
import { createClaudeProofStore } from "./claude-proof-store";
import { createClaudeRequestClient } from "./claude-request";
import { createClaudeSubscriptionReader } from "./claude-subscription";
import { createQuotaCooldownStore } from "./quota-cooldown-store";
import { copyQuotaIdentity, verifiedClaudeQuotaOwner } from "./quota-identity";
import { createQuotaRequestBudget } from "./quota-request";

const profile = {
	account: {
		uuid: "11111111-1111-4111-8111-111111111111",
		email: "fixture@example.test",
	},
	organization: { uuid: "22222222-2222-4222-8222-222222222222" },
};
const initialAt = Date.parse("2026-10-25T20:00:00Z");
const usage = () => ({
	five_hour: { utilization: 24, resets_at: "2026-10-26T01:00:00Z" },
	seven_day: { utilization: 52, resets_at: null },
});

test("usage outages retain dated exact-owner history, wallet and identity without retry bursts", async () => {
	let at = initialAt;
	let status = 200;
	const calls = { usage: 0, profile: 0, wallet: 0 };
	const requests = createClaudeRequestClient({
		store: createQuotaCooldownStore(undefined, () => at),
		now: () => at,
		random: () => 0,
		fetcher: async (url, init) => {
			expect(new URL(String(url)).origin).toBe("https://api.anthropic.com");
			expect(init?.redirect).toBe("error");
			if (String(url).endsWith("/profile")) {
				calls.profile++;
				return Response.json(profile);
			}
			if (String(url).endsWith("/prepaid/credits")) {
				calls.wallet++;
				return Response.json({ amount: 8871, currency: "USD" });
			}
			calls.usage++;
			return status === 200
				? Response.json(usage())
				: new Response(null, {
						status,
						headers: { "Retry-After": "600" },
					});
		},
	});
	const reader = createClaudeSubscriptionReader({
		request: requests.request,
		now: () => at,
		history: createClaudeLastKnownStore(undefined, () => at),
	});
	const first = await reader.read("fixture-success-then-outage");
	expect(first.status).toBe("ok");
	expect(first.prepaidBalance).toEqual({
		amount: 88.71,
		currency: "USD",
		checkedAt: new Date(initialAt),
	});
	const owner = verifiedClaudeQuotaOwner(first, at);
	expect(owner?.verifiedAt).toEqual(new Date(initialAt));
	expect(JSON.stringify(first)).not.toContain(owner?.identity ?? "impossible");
	at += 16 * 60_000;
	status = 429;
	const limited = await reader.read("fixture-success-then-outage");
	expect(limited.status).toBe("unavailable");
	expect(limited.windows).toEqual([]);
	expect(limited.lastKnownUsage?.fetchedAt).toEqual(new Date(initialAt));
	expect(limited.lastKnownUsage?.windows).toEqual(first.windows);
	expect(limited.prepaidBalance?.checkedAt).toEqual(new Date(initialAt));
	expect(verifiedClaudeQuotaOwner(limited, at)).toEqual(owner);
	expect(
		verifiedClaudeQuotaOwner(copyQuotaIdentity(limited, { ...limited }), at),
	).toEqual(owner);
	const deadline = limited.retryAt;
	at += 30_000;
	const repeated = await reader.read("fixture-success-then-outage");
	expect(repeated.retryAt).toEqual(deadline);
	expect(repeated.prepaidBalance?.checkedAt).toEqual(new Date(initialAt));
	expect(calls).toEqual({ usage: 2, profile: 1, wallet: 1 });
});

test("unauthorized usage removes history and cached owner proof before a later transient result", async () => {
	let at = initialAt;
	let usageStatus = 200;
	let profileStatus = 200;
	let profileCalls = 0;
	const requests = createClaudeRequestClient({
		store: createQuotaCooldownStore(undefined, () => at),
		now: () => at,
		fetcher: async (url) => {
			if (String(url).endsWith("/profile")) {
				profileCalls++;
				return profileStatus === 200
					? Response.json(profile)
					: new Response(null, { status: profileStatus });
			}
			if (String(url).endsWith("/prepaid/credits"))
				return new Response(null, { status: 403 });
			return usageStatus === 200
				? Response.json(usage())
				: new Response(null, { status: usageStatus });
		},
	});
	const reader = createClaudeSubscriptionReader({
		request: requests.request,
		now: () => at,
		history: createClaudeLastKnownStore(undefined, () => at),
	});
	await reader.read("fixture-auth-revocation");
	usageStatus = 401;
	const revoked = await reader.read("fixture-auth-revocation");
	expect(revoked.lastKnownUsage).toBeUndefined();
	expect(revoked.prepaidBalance).toBeUndefined();
	expect(verifiedClaudeQuotaOwner(revoked, at)).toBeNull();
	usageStatus = 503;
	profileStatus = 403;
	at += 1000;
	const unavailable = await reader.read("fixture-auth-revocation");
	expect(profileCalls).toBe(2);
	expect(unavailable.lastKnownUsage).toBeUndefined();
	expect(verifiedClaudeQuotaOwner(unavailable, at)).toBeNull();
});

test("missing authenticated principal or organization never enables wallet or owner history", async () => {
	for (const body of [
		{ email: "display@example.test" },
		{ account: profile.account },
		{ ...profile, account_uuid: "33333333-3333-4333-8333-333333333333" },
	]) {
		let walletCalls = 0;
		const requests = createClaudeRequestClient({
			store: createQuotaCooldownStore(),
			fetcher: async (url) => {
				if (String(url).endsWith("/profile")) return Response.json(body);
				if (String(url).endsWith("/prepaid/credits")) {
					walletCalls++;
					return Response.json({ amount: 100, currency: "USD" });
				}
				return Response.json(usage());
			},
		});
		const reader = createClaudeSubscriptionReader({
			request: requests.request,
			history: createClaudeLastKnownStore(),
		});
		const result = await reader.read("fixture-unverified-owner");
		expect(result.status).toBe("ok");
		expect(result.prepaidBalance).toBeUndefined();
		expect(verifiedClaudeQuotaOwner(result)).toBeNull();
		expect(walletCalls).toBe(0);
	}
});

test("identity changes preserve valid quota while refusing another owner's history and balance", async () => {
	let at = initialAt;
	let activeProfile = profile;
	let usageStatus = 200;
	const requests = createClaudeRequestClient({
		store: createQuotaCooldownStore(undefined, () => at),
		now: () => at,
		fetcher: async (url) => {
			if (String(url).endsWith("/profile")) return Response.json(activeProfile);
			if (String(url).endsWith("/prepaid/credits"))
				return Response.json({ amount: 400, currency: "USD" });
			return usageStatus === 200
				? Response.json(usage())
				: new Response(null, { status: usageStatus });
		},
	});
	const reader = createClaudeSubscriptionReader({
		request: requests.request,
		now: () => at,
		history: createClaudeLastKnownStore(undefined, () => at),
	});
	const first = await reader.read("fixture-first-owner");
	at += 1000;
	activeProfile = {
		...profile,
		organization: { uuid: "33333333-3333-4333-8333-333333333333" },
	};
	usageStatus = 503;
	const changed = await reader.read("fixture-replacement-token");
	expect(changed.lastKnownUsage).toBeUndefined();
	expect(changed.prepaidBalance).toBeUndefined();
	expect(verifiedClaudeQuotaOwner(changed, at)?.identity).not.toBe(
		verifiedClaudeQuotaOwner(first, at)?.identity,
	);
});

test("malformed optional quota windows cannot erase valid basic windows or invent reset dates", async () => {
	const requests = createClaudeRequestClient({
		store: createQuotaCooldownStore(),
		fetcher: async (url) => {
			if (String(url).endsWith("/profile"))
				return new Response(null, { status: 403 });
			return Response.json({
				five_hour: { utilization: 135, resets_at: "not-a-date" },
				seven_day: { utilization: "bad" },
				limits: { invalid: true },
			});
		},
	});
	const reader = createClaudeSubscriptionReader({
		request: requests.request,
		history: createClaudeLastKnownStore(),
	});
	const result = await reader.read("fixture-malformed-optional");
	expect(result.windows).toHaveLength(1);
	expect(result.windows[0]).toMatchObject({
		id: "five_hour",
		usedPercent: 100,
		resetsAt: null,
		source: "provider",
	});
	expect(result.prepaidBalance).toBeUndefined();
});

test("a freshly authenticated replacement token retains the same opaque owner without inheriting funds", async () => {
	let status = 200;
	const requests = createClaudeRequestClient({
		store: createQuotaCooldownStore(),
		fetcher: async (url) => {
			if (String(url).endsWith("/profile")) return Response.json(profile);
			if (String(url).endsWith("/prepaid/credits"))
				return Response.json({ amount: 100, currency: "USD" });
			return status === 200
				? Response.json(usage())
				: new Response(null, { status });
		},
	});
	const reader = createClaudeSubscriptionReader({
		request: requests.request,
		history: createClaudeLastKnownStore(),
	});
	const original = await reader.read("fixture-before-rotation");
	status = 503;
	const rotated = await reader.read("fixture-after-rotation");
	expect(verifiedClaudeQuotaOwner(rotated)?.identity).toBe(
		verifiedClaudeQuotaOwner(original)?.identity,
	);
	expect(rotated.lastKnownUsage).toBeUndefined();
	expect(rotated.prepaidBalance).toBeUndefined();
});

test("a restart during provider outage retains exact dated display provenance and history, never a native proof", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { createClaudeProofStore } = await import("./claude-proof-store");
	const { verifiedNativeClaudeQuotaScope, claudeProfileRegistration } =
		await import("./quota-identity");
	const root = await mkdtemp(join(tmpdir(), "claude-restart-"));
	let at = initialAt;
	let outage = false;
	let unauthorized = false;
	const fetcher = async (url: string | URL | Request) => {
		if (String(url).endsWith("/profile"))
			return outage
				? new Response(null, { status: 503 })
				: Response.json(profile);
		if (String(url).endsWith("/prepaid/credits"))
			return new Response(null, { status: 403 });
		return unauthorized
			? new Response(null, { status: 401 })
			: outage
				? new Response(null, { status: 429, headers: { "Retry-After": "600" } })
				: Response.json(usage());
	};
	const reader = () =>
		createClaudeSubscriptionReader({
			request: createClaudeRequestClient({
				fetcher,
				store: createQuotaCooldownStore(),
				now: () => at,
			}).request,
			now: () => at,
			proofs: createClaudeProofStore(join(root, "proof.json"), () => at),
			history: createClaudeLastKnownStore(join(root, "history.json"), () => at),
		});
	try {
		const context = { canonicalProfile: "/fixture/profile" };
		const first = await reader().read(
			"fixture-restart-proof",
			undefined,
			context,
		);
		const owner = verifiedClaudeQuotaOwner(first, at);
		at += 16 * 60_000;
		outage = true;
		const restarted = await reader().read(
			"fixture-restart-proof",
			undefined,
			context,
		);
		expect(restarted.status).toBe("unavailable");
		expect(restarted.windows).toEqual([]);
		expect(verifiedClaudeQuotaOwner(restarted, at)).toEqual(owner);
		expect(restarted.lastKnownUsage?.fetchedAt).toEqual(new Date(initialAt));
		expect(restarted.lastKnownUsage?.windows).toEqual(first.windows);
		expect(
			verifiedNativeClaudeQuotaScope(
				restarted,
				"fixture-restart-proof",
				"/fixture/profile",
				claudeProfileRegistration(profile) ?? "",
				at,
			),
		).toBeNull();
		const rotated = await reader().read(
			"fixture-rotated-proof",
			undefined,
			context,
		);
		expect(verifiedClaudeQuotaOwner(rotated, at)).toBeNull();
		expect(rotated.lastKnownUsage).toBeUndefined();
		unauthorized = true;
		await reader().read("fixture-restart-proof", undefined, context);
		unauthorized = false;
		const afterRevocation = await reader().read(
			"fixture-restart-proof",
			undefined,
			context,
		);
		expect(verifiedClaudeQuotaOwner(afterRevocation, at)).toBeNull();
		expect(afterRevocation.lastKnownUsage).toBeUndefined();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function deadlineClock() {
	let at = initialAt;
	let nextId = 0;
	const pending = new Map<number, { at: number; callback: () => void }>();
	const now = () => at;
	return {
		now,
		advance(milliseconds: number) {
			at += milliseconds;
			for (const [id, timer] of [...pending]) {
				if (timer.at > at) continue;
				pending.delete(id);
				timer.callback();
			}
		},
		createBudget: (milliseconds: number) =>
			createQuotaRequestBudget(milliseconds, now, {
				set(callback, delay) {
					const id = ++nextId;
					pending.set(id, { at: at + delay, callback });
					return id as unknown as ReturnType<typeof setTimeout>;
				},
				clear(timer) {
					pending.delete(timer as unknown as number);
				},
			}),
		pending: () => pending.size,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("an optional profile timeout at the original deadline keeps admitted quota without inventing an owner", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const profileResponse = deferred<Response>();
	let optionalSignal: AbortSignal | null | undefined;
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: createClaudeLastKnownStore(undefined, clock.now),
		request: async (endpoint, _token, _url, init) => {
			if (endpoint === "usage") {
				clock.advance(6_000);
				return Response.json(usage());
			}
			expect(endpoint).toBe("profile");
			optionalSignal = init.signal;
			started.resolve();
			return profileResponse.promise;
		},
	});
	const result = reader.read("fixture-optional-profile-timeout");
	await started.promise;
	clock.advance(2_000);
	const quota = await result;
	expect(quota.status).toBe("ok");
	expect(quota.windows.map((window) => window.usedPercent)).toEqual([24, 52]);
	expect(quota.fetchedAt).toEqual(new Date(initialAt + 6_000));
	expect(
		quota.windows.every(
			(window) => window.observedAt?.getTime() === initialAt + 6_000,
		),
	).toBe(true);
	expect(quota.prepaidBalance).toBeUndefined();
	expect(verifiedClaudeQuotaOwner(quota, clock.now())).toBeNull();
	expect(optionalSignal?.aborted).toBe(true);
	expect(clock.pending()).toBe(0);
	profileResponse.resolve(Response.json(profile));
});

test("a timed-out optional wallet keeps its dated balance and current quota as separate observations", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const walletResponse = deferred<Response>();
	let stallWallet = false;
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: createClaudeLastKnownStore(undefined, clock.now),
		request: async (endpoint) => {
			if (endpoint === "usage") {
				if (stallWallet) clock.advance(6_000);
				return Response.json(usage());
			}
			if (endpoint === "profile") return Response.json(profile);
			if (stallWallet) {
				started.resolve();
				return walletResponse.promise;
			}
			return Response.json({ amount: 8871, currency: "USD" });
		},
	});
	const original = await reader.read("fixture-optional-wallet-timeout");
	clock.advance(30 * 60_000);
	stallWallet = true;
	const result = reader.read("fixture-optional-wallet-timeout");
	await started.promise;
	clock.advance(2_000);
	const quota = await result;
	expect(quota.status).toBe("ok");
	expect(quota.windows.map((window) => window.usedPercent)).toEqual([24, 52]);
	expect(quota.prepaidBalance).toEqual(original.prepaidBalance);
	expect(quota.prepaidBalance?.checkedAt).toEqual(new Date(initialAt));
	expect(quota.fetchedAt).toEqual(new Date(initialAt + 30 * 60_000 + 6_000));
	expect(clock.pending()).toBe(0);
	walletResponse.resolve(new Response(null, { status: 503 }));
});

test("the primary deadline still rejects a response that has not arrived", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const response = deferred<Response>();
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: createClaudeLastKnownStore(undefined, clock.now),
		request: async () => {
			started.resolve();
			return response.promise;
		},
	});
	const result = reader.read("fixture-primary-deadline");
	await started.promise;
	clock.advance(8_000);
	const quota = await result;
	expect(quota.status).toBe("unavailable");
	expect(quota.windows).toEqual([]);
	expect(quota.prepaidBalance).toBeUndefined();
	expect(clock.pending()).toBe(0);
	response.resolve(Response.json(usage()));
});

test.each([
	401, 403,
])("a late explicit profile denial %i revokes cached proof after the optional deadline", async (status) => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const response = deferred<Response>();
	const forgotten = deferred<void>();
	const token = `fixture-late-profile-denial-${status}`;
	const canonical = "/fixture/late-profile-denial";
	const store = createClaudeProofStore(undefined, clock.now);
	store.remember(token, canonical, profile, clock.now());
	expect(store.get(token, canonical)).not.toBeNull();
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: createClaudeLastKnownStore(undefined, clock.now),
		proofs: {
			...store,
			forget(value) {
				store.forget(value);
				forgotten.resolve();
			},
		},
		request: async (endpoint) => {
			if (endpoint === "usage") {
				clock.advance(6_000);
				return Response.json(usage());
			}
			expect(endpoint).toBe("profile");
			started.resolve();
			return response.promise;
		},
	});
	const result = reader.read(token, undefined, { canonicalProfile: canonical });
	await started.promise;
	clock.advance(2_000);
	expect((await result).status).toBe("ok");
	response.resolve(new Response(null, { status }));
	await forgotten.promise;
	expect(store.get(token, canonical)).toBeNull();
	expect(clock.pending()).toBe(0);
});

test.each([
	401, 403,
])("a primary denial %i arriving after cancellation still revokes exact-token provenance", async (status) => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const deniedResponse = deferred<Response>();
	const forgotten = deferred<void>();
	const token = `fixture-late-primary-denial-${status}`;
	const canonical = "/fixture/late-primary-denial";
	const store = createClaudeProofStore(undefined, clock.now);
	let mode: "ok" | "delayed" | "unavailable" = "ok";
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: createClaudeLastKnownStore(undefined, clock.now),
		proofs: {
			...store,
			forget(value) {
				store.forget(value);
				forgotten.resolve();
			},
		},
		request: async (endpoint) => {
			if (endpoint === "profile")
				return mode === "ok"
					? Response.json(profile)
					: new Response(null, { status: 503 });
			if (endpoint === "wallet") return new Response(null, { status: 403 });
			if (mode === "delayed") {
				started.resolve();
				return deniedResponse.promise;
			}
			return mode === "ok"
				? Response.json(usage())
				: new Response(null, { status: 503 });
		},
	});
	await reader.read(token, undefined, { canonicalProfile: canonical });
	expect(store.get(token, canonical)).not.toBeNull();
	mode = "delayed";
	const result = reader.read(token, undefined, { canonicalProfile: canonical });
	await started.promise;
	clock.advance(8_000);
	expect((await result).status).toBe("unavailable");
	deniedResponse.resolve(new Response(null, { status }));
	await forgotten.promise;
	expect(store.get(token, canonical)).toBeNull();
	mode = "unavailable";
	const after = await reader.read(token, undefined, {
		canonicalProfile: canonical,
	});
	expect(after.lastKnownUsage).toBeUndefined();
	expect(verifiedClaudeQuotaOwner(after, clock.now())).toBeNull();
	expect(clock.pending()).toBe(0);
});

test("a stalled history write is bounded without discarding admitted quota or queueing later writes", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const saved = deferred<void>();
	let writes = 0;
	const history = createClaudeLastKnownStore(undefined, clock.now);
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: {
			...history,
			remember: async () => {
				writes++;
				started.resolve();
				return saved.promise;
			},
		},
		request: async (endpoint) =>
			endpoint === "usage"
				? Response.json(usage())
				: endpoint === "profile"
					? Response.json(profile)
					: new Response(null, { status: 403 }),
	});
	const first = reader.read("fixture-stalled-history-write");
	await started.promise;
	clock.advance(8_000);
	const quota = await first;
	expect(quota.status).toBe("ok");
	expect(quota.windows.map((window) => window.usedPercent)).toEqual([24, 52]);
	expect(quota.fetchedAt).toEqual(new Date(initialAt));
	expect(
		quota.windows.every((window) => window.observedAt?.getTime() === initialAt),
	).toBe(true);
	expect((await reader.read("fixture-stalled-history-write")).status).toBe(
		"ok",
	);
	expect(writes).toBe(1);
	expect(clock.pending()).toBe(0);
	saved.resolve();
});

test("a stalled history read cannot delay an outage result or refresh the wallet's date", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const historyResult = deferred<undefined>();
	let outage = false;
	let reads = 0;
	const history = createClaudeLastKnownStore(undefined, clock.now);
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: {
			...history,
			get: async () => {
				reads++;
				started.resolve();
				return historyResult.promise;
			},
		},
		request: async (endpoint) =>
			endpoint === "usage"
				? outage
					? new Response(null, { status: 503 })
					: Response.json(usage())
				: endpoint === "profile"
					? Response.json(profile)
					: Response.json({ amount: 8871, currency: "USD" }),
	});
	const original = await reader.read("fixture-stalled-history-read");
	outage = true;
	const pending = reader.read("fixture-stalled-history-read");
	await started.promise;
	clock.advance(8_000);
	const quota = await pending;
	expect(quota.status).toBe("unavailable");
	expect(quota.lastKnownUsage).toBeUndefined();
	expect(quota.prepaidBalance).toEqual(original.prepaidBalance);
	expect(quota.prepaidBalance?.checkedAt).toEqual(new Date(initialAt));
	expect(
		(await reader.read("fixture-stalled-history-read")).lastKnownUsage,
	).toBeUndefined();
	expect(reads).toBe(1);
	expect(clock.pending()).toBe(0);
	historyResult.resolve(undefined);
});

test("denial quarantines provenance before a stalled history deletion and never queues a second deletion", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const deleted = deferred<void>();
	const token = "fixture-stalled-history-denial";
	const canonical = "/fixture/stalled-history-denial";
	const proofs = createClaudeProofStore(undefined, clock.now);
	let usageStatus = 200;
	let deletes = 0;
	let ownerDeletes = 0;
	const history = createClaudeLastKnownStore(undefined, clock.now);
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		proofs,
		history: {
			...history,
			forget: async () => {
				deletes++;
				started.resolve();
				return deleted.promise;
			},
			forgetVerifiedOwner: async () => {
				ownerDeletes++;
			},
		},
		request: async (endpoint) =>
			endpoint === "usage"
				? usageStatus === 200
					? Response.json(usage())
					: new Response(null, { status: usageStatus })
				: endpoint === "profile"
					? Response.json(profile)
					: new Response(null, { status: 403 }),
	});
	await reader.read(token, undefined, { canonicalProfile: canonical });
	expect(proofs.get(token, canonical)).not.toBeNull();
	usageStatus = 401;
	const result = reader.read(token, undefined, { canonicalProfile: canonical });
	await started.promise;
	expect(proofs.get(token, canonical)).toBeNull();
	clock.advance(8_000);
	const denied = await result;
	expect(denied.status).toBe("token_expired");
	expect(verifiedClaudeQuotaOwner(denied, clock.now())).toBeNull();
	usageStatus = 503;
	const unavailable = await reader.read(token, undefined, {
		canonicalProfile: canonical,
	});
	expect(unavailable.lastKnownUsage).toBeUndefined();
	expect(verifiedClaudeQuotaOwner(unavailable, clock.now())).toBeNull();
	expect(deletes).toBe(1);
	expect(ownerDeletes).toBe(0);
	expect(clock.pending()).toBe(0);
	deleted.resolve();
});

test("one stalled account's history write cannot starve another account or queue duplicate writes", async () => {
	const clock = deadlineClock();
	const started = deferred<void>();
	const saved = deferred<void>();
	const finished = deferred<void>();
	const firstToken = "fixture-history-scope-stalled";
	const secondToken = "fixture-history-scope-healthy";
	const writes: string[] = [];
	const history = createClaudeLastKnownStore(undefined, clock.now);
	const reader = createClaudeSubscriptionReader({
		now: clock.now,
		createBudget: clock.createBudget,
		history: {
			...history,
			remember: async (token, account, quota) => {
				writes.push(token);
				if (token === firstToken) {
					started.resolve();
					await saved.promise;
				}
				await history.remember(token, account, quota);
				if (token === firstToken) finished.resolve();
			},
		},
		request: async (endpoint) =>
			endpoint === "usage"
				? Response.json(usage())
				: endpoint === "profile"
					? Response.json(profile)
					: new Response(null, { status: 403 }),
	});
	const first = reader.read(firstToken);
	await started.promise;
	const healthy = await reader.read(secondToken);
	expect(healthy.status).toBe("ok");
	expect(writes).toEqual([firstToken, secondToken]);
	const persisted = await history.get(secondToken, profile);
	if (!persisted) throw new Error("Healthy account history was not saved");
	expect(persisted.fetchedAt).toEqual(new Date(initialAt));
	expect(healthy.windows).toEqual(persisted.windows);
	clock.advance(8_000);
	const stalled = await first;
	expect(stalled.status).toBe("ok");
	expect(stalled.fetchedAt).toEqual(new Date(initialAt));
	expect((await reader.read(firstToken)).status).toBe("ok");
	expect(writes).toEqual([firstToken, secondToken]);
	expect(clock.pending()).toBe(0);
	saved.resolve();
	await finished.promise;
});
