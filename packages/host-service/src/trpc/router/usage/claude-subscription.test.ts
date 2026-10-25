import { expect, test } from "bun:test";
import { createClaudeLastKnownStore } from "./claude-last-known";
import { createClaudeRequestClient } from "./claude-request";
import { createClaudeSubscriptionReader } from "./claude-subscription";
import { createQuotaCooldownStore } from "./quota-cooldown-store";
import { copyQuotaIdentity, verifiedClaudeQuotaOwner } from "./quota-identity";

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
