// Run with Node/tsx or Electron-as-Node. Bun must be absent: a Bun-only parser
// passed the ordinary test suite but failed inside the packaged host runtime.
import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { captureCodexQuotaSnapshot } from "./codex.ts";
import { discoverCodexHomes } from "./profiles.ts";

const quota = {
	email: "synthetic@example.test",
	plan: "test",
	status: "ok" as const,
	statusDetail: null,
	windows: [
		{ id: "primary", label: "Session", usedPercent: 25, resetsAt: null },
	],
	creditsBalance: null,
};

test("Node captured Codex auth accepts valid file-store TOML without a Bun global", async () => {
	assert.equal(typeof (globalThis as { Bun?: unknown }).Bun, "undefined");
	for (const [index, config] of [
		undefined,
		"",
		'model = "synthetic"',
		"# file store\ncli_auth_credentials_store = 'file'",
		'"cli_auth_credentials_store" = "file"\n[profiles.synthetic]\nmodel="synthetic"',
	].entries()) {
		const home = await mkdtemp(join(tmpdir(), "codex-quota-config-node-"));
		try {
			if (config !== undefined)
				await writeFile(join(home, "config.toml"), config);
			await writeFile(
				join(home, "auth.json"),
				JSON.stringify({
					auth_mode: "chatgpt",
					tokens: {
						access_token: `synthetic-node-valid-${index}`,
						account_id: "synthetic-account",
					},
				}),
			);
			let requests = 0;
			const snapshot = await captureCodexQuotaSnapshot(
				async () => [
					{
						home,
						sourceLabel: "synthetic",
						credentialKind: "subscription",
						loginFingerprint: null,
					},
				],
				async (token, accountId) => {
					assert.equal(token, `synthetic-node-valid-${index}`);
					assert.equal(accountId, "synthetic-account");
					requests++;
					return quota;
				},
			);
			const [account] = await snapshot.load(true);
			assert.equal(account?.status, "ok");
			assert.equal(requests, 1);
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	}
});

test("Node discovery distinguishes missing auth with valid TOML from unsupported stores", async () => {
	assert.equal(typeof (globalThis as { Bun?: unknown }).Bun, "undefined");
	for (const config of [
		'cli_auth_credentials_store="file"',
		'cli_auth_credentials_store="keyring"',
		'cli_auth_credentials_store="auto"',
		'cli_auth_credentials_store="ephemeral"',
		"cli_auth_credentials_store=42",
		"broken = [",
		'cli_auth_credentials_store="file"\ncli_auth_credentials_store="keyring"',
	]) {
		const home = await mkdtemp(join(tmpdir(), "codex-quota-discovery-node-"));
		try {
			await writeFile(join(home, "config.toml"), config);
			const [account] = await discoverCodexHomes({
				defaultHome: home,
				candidates: [],
				includeUnavailable: true,
			});
			assert.equal(
				account?.quotaUnavailable,
				config === 'cli_auth_credentials_store="file"' ? undefined : true,
			);
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	}
});

test("Node malformed/unsupported configs refuse captured auth before any quota request", async () => {
	for (const [index, config] of [
		'cli_auth_credentials_store="keyring"',
		'cli_auth_credentials_store="auto"',
		'cli_auth_credentials_store="ephemeral"',
		"cli_auth_credentials_store=false",
		"broken = [",
		'cli_auth_credentials_store="file"\ncli_auth_credentials_store="auto"',
	].entries()) {
		const home = await mkdtemp(join(tmpdir(), "codex-quota-refusal-node-"));
		try {
			await writeFile(join(home, "config.toml"), config);
			await writeFile(
				join(home, "auth.json"),
				JSON.stringify({
					auth_mode: "chatgpt",
					tokens: {
						access_token: `synthetic-node-refusal-${index}`,
						account_id: "synthetic-account",
					},
				}),
			);
			let requests = 0;
			const snapshot = await captureCodexQuotaSnapshot(
				async () => [
					{
						home,
						sourceLabel: "synthetic",
						credentialKind: "subscription",
						loginFingerprint: null,
					},
				],
				async () => {
					requests++;
					return quota;
				},
			);
			const [account] = await snapshot.load(true);
			assert.equal(account?.status, "unavailable");
			assert.equal(requests, 0);
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	}
});

test("Node file-store auth validation still refuses malformed or non-ChatGPT identities", async () => {
	for (const [index, auth] of [
		"not-json",
		JSON.stringify({ auth_mode: "api", tokens: { access_token: "synthetic" } }),
		JSON.stringify({ tokens: 42 }),
		JSON.stringify({
			tokens: { access_token: "synthetic", account_id: { wrong: true } },
		}),
	].entries()) {
		const home = await mkdtemp(join(tmpdir(), "codex-quota-identity-node-"));
		try {
			await writeFile(
				join(home, "config.toml"),
				'cli_auth_credentials_store = "file"',
			);
			await writeFile(join(home, "auth.json"), auth);
			let requests = 0;
			const snapshot = await captureCodexQuotaSnapshot(
				async () => [
					{
						home,
						sourceLabel: `synthetic-${index}`,
						credentialKind: "subscription",
						loginFingerprint: null,
					},
				],
				async () => {
					requests++;
					return quota;
				},
			);
			const [account] = await snapshot.load(true);
			assert.equal(account?.status, "unavailable");
			assert.equal(requests, 0);
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	}
});
