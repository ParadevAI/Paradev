import { expect, test } from "bun:test";
import {
	bindClaudeQuotaIdentity,
	copyQuotaIdentity,
	verifiedClaudeQuotaOwner,
	verifiedClaudeQuotaScope,
} from "./quota-identity";

const profile = {
	account: { uuid: "11111111-1111-4111-8111-111111111111" },
	organization: { uuid: "22222222-2222-4222-8222-222222222222" },
};

test("opaque owner proof is exact-token, independently dated and rejected after expiry", () => {
	const value = bindClaudeQuotaIdentity({}, "fixture-token", profile, 1000);
	const scope = verifiedClaudeQuotaScope(
		value,
		"fixture-token",
		"/fixture/profile",
		2000,
	);
	expect(scope).toMatch(/^[a-f0-9]{64}$/);
	expect(
		verifiedClaudeQuotaScope(value, "other-token", "/fixture/profile", 2000),
	).toBeNull();
	expect(
		verifiedClaudeQuotaScope(value, "fixture-token", null, 2000),
	).toBeNull();
	expect(verifiedClaudeQuotaOwner(value, 999)).toBeNull();
	expect(
		verifiedClaudeQuotaOwner(value, 1000 + 6 * 60 * 60_000 + 1),
	).toBeNull();
	expect(
		verifiedClaudeQuotaScope(
			value,
			"fixture-token",
			"/fixture/profile",
			1000 + 6 * 60 * 60_000 + 1,
		),
	).toBeNull();
	const copied = copyQuotaIdentity(value, { fetchedAt: new Date(100_000) });
	expect(verifiedClaudeQuotaOwner(copied, 100_000)?.verifiedAt).toEqual(
		new Date(1000),
	);
	expect(JSON.stringify(copied)).not.toContain("fixture-token");
});

test("an undated or contradictory authenticated profile cannot mint owner authority", () => {
	expect(
		verifiedClaudeQuotaOwner(
			bindClaudeQuotaIdentity({}, "fixture-token", profile),
			1000,
		),
	).toBeNull();
	const conflicting = {
		...profile,
		account_uuid: "33333333-3333-4333-8333-333333333333",
	};
	expect(
		verifiedClaudeQuotaOwner(
			bindClaudeQuotaIdentity({}, "fixture-token", conflicting, 1000),
			1000,
		),
	).toBeNull();
});
