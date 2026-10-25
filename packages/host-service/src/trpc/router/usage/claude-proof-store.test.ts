import { expect, test } from "bun:test";
import {
	chmodSync,
	linkSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaudeProofStore } from "./claude-proof-store";
import {
	restoreClaudeQuotaIdentity,
	verifiedClaudeQuotaOwner,
	verifiedNativeClaudeQuotaScope,
} from "./quota-identity";

const profile = {
	account: {
		uuid: "11111111-1111-4111-8111-111111111111",
		email: "fixture@example.test",
	},
	organization: { uuid: "22222222-2222-4222-8222-222222222222" },
};
const at = 1_000_000;

test("restart preserves only exact-token/path dated owner provenance and never native authorization", () => {
	const root = mkdtempSync(join(tmpdir(), "claude-proof-"));
	try {
		const path = join(root, "proof.json");
		createClaudeProofStore(path, () => at).remember(
			"private-fixture-token",
			"/fixture/profile",
			profile,
			at - 1000,
		);
		const serialized = readFileSync(path, "utf8");
		for (const secret of [
			"private-fixture-token",
			"/fixture/profile",
			profile.account.uuid,
			profile.account.email,
			profile.organization.uuid,
		])
			expect(serialized).not.toContain(secret);
		expect(statSync(path).mode & 0o777).toBe(0o600);
		const store = createClaudeProofStore(path, () => at + 1000);
		const proof = store.get("private-fixture-token", "/fixture/profile");
		if (!proof) throw new Error("Fixture proof missing.");
		expect(proof.verifiedAt).toBe(at - 1000);
		expect(store.get("new-token", "/fixture/profile")).toBeNull();
		expect(store.get("private-fixture-token", "/other/profile")).toBeNull();
		expect(store.get("private-fixture-token", null)).toBeNull();
		const value = restoreClaudeQuotaIdentity({}, proof, at);
		expect(verifiedClaudeQuotaOwner(value, at)?.verifiedAt).toEqual(
			new Date(at - 1000),
		);
		expect(
			verifiedNativeClaudeQuotaScope(
				value,
				"private-fixture-token",
				"/fixture/profile",
				proof.registrationHash ?? "",
				at,
			),
		).toBeNull();
		store.forget("private-fixture-token");
		expect(
			createClaudeProofStore(path, () => at).get(
				"private-fixture-token",
				"/fixture/profile",
			),
		).toBeNull();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("future/expired proof and unsafe aliases or permissions fail closed", () => {
	const root = mkdtempSync(join(tmpdir(), "claude-proof-"));
	try {
		const path = join(root, "proof.json");
		const store = createClaudeProofStore(path, () => at);
		store.remember("fixture-token", "/fixture/profile", profile, at + 1);
		expect(store.get("fixture-token", "/fixture/profile")).toBeNull();
		store.remember("fixture-token", "/fixture/profile", profile, at);
		expect(
			createClaudeProofStore(path, () => at + 6 * 60 * 60_000 + 1).get(
				"fixture-token",
				"/fixture/profile",
			),
		).toBeNull();
		expect(
			createClaudeProofStore(path, () => at - 1).get(
				"fixture-token",
				"/fixture/profile",
			),
		).toBeNull();
		const alias = join(root, "alias.json");
		symlinkSync(path, alias);
		expect(
			createClaudeProofStore(alias, () => at).get(
				"fixture-token",
				"/fixture/profile",
			),
		).toBeNull();
		rmSync(alias);
		linkSync(path, alias);
		expect(
			createClaudeProofStore(path, () => at).get(
				"fixture-token",
				"/fixture/profile",
			),
		).toBeNull();
		rmSync(alias);
		if (process.platform !== "win32") {
			chmodSync(path, 0o644);
			expect(
				createClaudeProofStore(path, () => at).get(
					"fixture-token",
					"/fixture/profile",
				),
			).toBeNull();
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
