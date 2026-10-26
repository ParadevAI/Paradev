import { expect, test } from "bun:test";
import { createNativeClaudeScopeResolver } from "./native-claude-scope";
import { hashQuotaScope } from "./quota-cooldown-store";
import {
	bindClaudeQuotaIdentity,
	claudeProfileRegistration,
	claudeQuotaProof,
	restoreClaudeQuotaIdentity,
} from "./quota-identity";

const profile = {
	account: {
		uuid: "11111111-1111-4111-8111-111111111111",
		email: "fixture@example.test",
	},
	organization: { uuid: "22222222-2222-4222-8222-222222222222" },
};
const identity = claudeProfileRegistration(profile) ?? "";
const at = 1_000_000;
const credential = {
	accessToken: "native-fixture-token",
	canonicalProfile: "/fixture/profile",
	registrationHash: identity,
};

test("cold launches capture only a generation and recover after authenticated shared proof warms", async () => {
	let quota: object | undefined;
	let reads = 0;
	const resolver = createNativeClaudeScopeResolver({
		readCurrent: async () => {
			reads++;
			return credential;
		},
		canonicalize: async (directory) => directory,
		peekQuota: () => quota,
		now: () => at,
	});
	const generation = await resolver.captureGeneration(
		"/fixture/profile",
		"/fixture/profile",
		identity,
	);
	expect(generation).toMatch(/^[a-f0-9]{64}$/);
	expect(
		await resolver.resolve(
			"/fixture/profile",
			"/fixture/profile",
			identity,
			generation ?? "",
		),
	).toBeNull();
	quota = bindClaudeQuotaIdentity(
		{},
		credential.accessToken,
		profile,
		at - 1000,
	);
	const scope = await resolver.resolve(
		"/fixture/profile",
		"/fixture/profile",
		identity,
		generation ?? "",
	);
	expect(scope).toMatch(/^[a-f0-9]{64}$/);
	expect(scope).not.toBe(generation);
	expect(JSON.stringify({ generation, scope })).not.toContain(
		credential.accessToken,
	);
	expect(reads).toBe(6);
});

test("registration exactly matches the public tuple and fails closed on conflicting aliases", () => {
	expect(identity).toBe(
		hashQuotaScope([profile.account.uuid, undefined, profile.account.email]),
	);
	expect(
		claudeProfileRegistration({ ...profile, email: "different@example.test" }),
	).toBeNull();
	expect(
		claudeProfileRegistration({
			account: { uuid: profile.account.uuid },
			organization: profile.organization,
		}),
	).toBeNull();
});

test("persisted display proof, foreign registration, rotated token, changed directory and expired proof cannot authorize native scope", async () => {
	const proof = claudeQuotaProof(credential.accessToken, profile, at);
	if (!proof) throw new Error("Fixture proof missing.");
	const persisted = restoreClaudeQuotaIdentity({}, proof, at);
	let quota: object = persisted;
	let current = credential;
	let directory: string | null = "/fixture/profile";
	const resolver = createNativeClaudeScopeResolver({
		readCurrent: async () => current,
		canonicalize: async () => directory,
		peekQuota: () => quota,
		now: () => at,
	});
	expect(await resolver.resolve(null, "/fixture/profile", identity)).toBeNull();
	quota = bindClaudeQuotaIdentity({}, credential.accessToken, profile, at);
	expect(
		await resolver.resolve(null, "/fixture/profile", hashQuotaScope("foreign")),
	).toBeNull();
	const generation = await resolver.captureGeneration(
		null,
		"/fixture/profile",
		identity,
	);
	current = { ...credential, accessToken: "rotated-fixture-token" };
	expect(
		await resolver.resolve(
			null,
			"/fixture/profile",
			identity,
			generation ?? "",
		),
	).toBeNull();
	current = credential;
	directory = "/other/profile";
	expect(await resolver.resolve(null, "/fixture/profile", identity)).toBeNull();
	directory = "/fixture/profile";
	quota = bindClaudeQuotaIdentity(
		{},
		credential.accessToken,
		profile,
		at - 6 * 60 * 60_000 - 1,
	);
	expect(await resolver.resolve(null, "/fixture/profile", identity)).toBeNull();
});

test("credential and canonical-path replacement at either proof boundary is rejected", async () => {
	for (const replacedAt of [1, 2]) {
		let reads = 0;
		const quota = bindClaudeQuotaIdentity(
			{},
			credential.accessToken,
			profile,
			at,
		);
		const resolver = createNativeClaudeScopeResolver({
			readCurrent: async () =>
				++reads === replacedAt
					? { ...credential, accessToken: "replaced" }
					: credential,
			canonicalize: async (value) => value,
			peekQuota: () => quota,
			now: () => at,
		});
		expect(
			await resolver.resolve(null, "/fixture/profile", identity),
		).toBeNull();
	}
	let paths = 0;
	const resolver = createNativeClaudeScopeResolver({
		readCurrent: async () => credential,
		canonicalize: async () =>
			++paths === 2 ? "/other/profile" : "/fixture/profile",
		peekQuota: () =>
			bindClaudeQuotaIdentity({}, credential.accessToken, profile, at),
		now: () => at,
	});
	expect(await resolver.resolve(null, "/fixture/profile", identity)).toBeNull();
});

test("captured and legacy proof resolution each use exactly two fresh credential reads", async () => {
	let reads = 0;
	const quota = bindClaudeQuotaIdentity(
		{},
		credential.accessToken,
		profile,
		at,
	);
	const resolver = createNativeClaudeScopeResolver({
		readCurrent: async () => {
			reads++;
			return credential;
		},
		canonicalize: async (value) => value,
		peekQuota: () => quota,
		now: () => at,
	});
	const captured = await resolver.captureGeneration(
		null,
		"/fixture/profile",
		identity,
	);
	expect(reads).toBe(2);
	reads = 0;
	expect(
		await resolver.resolve(null, "/fixture/profile", identity, captured ?? ""),
	).toMatch(/^[a-f0-9]{64}$/);
	expect(reads).toBe(2);
	reads = 0;
	expect(await resolver.resolve(null, "/fixture/profile", identity)).toMatch(
		/^[a-f0-9]{64}$/,
	);
	expect(reads).toBe(2);
	expect(
		await resolver.resolve(null, "/fixture/profile", identity, "wrong"),
	).toBeNull();
});

test("directory retargeting during the final proof read rejects the original credential", async () => {
	let directory = "/fixture/profile";
	let reads = 0;
	const resolver = createNativeClaudeScopeResolver({
		readCurrent: async () => {
			if (++reads === 2) directory = "/other/profile";
			return credential;
		},
		canonicalize: async () => directory,
		peekQuota: () =>
			bindClaudeQuotaIdentity({}, credential.accessToken, profile, at),
		now: () => at,
	});
	expect(await resolver.resolve(null, "/fixture/profile", identity)).toBeNull();
});
