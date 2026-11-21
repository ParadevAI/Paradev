import { describe, expect, it } from "bun:test";
import { dedupeCodexAccounts } from "./codex";
import type { UsageAccount } from "./types";

function codexAccount(accountKey: string, email: string | null): UsageAccount {
	return {
		agent: "codex",
		credentialKind: "subscription",
		accountKey,
		sourceLabel: accountKey,
		email,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: false,
		fetchedAt: new Date(0),
	};
}

describe("dedupeCodexAccounts", () => {
	it("keeps a personal account and a workspace seat that share an email", () => {
		const personal = codexAccount("/home/.codex/auth.json", "dev@example.com");
		const workspace = codexAccount(
			"/home/.codex-work/auth.json",
			"dev@example.com",
		);
		expect(
			dedupeCodexAccounts([
				{ account: personal, chatgptAccountId: "personal-account" },
				{ account: workspace, chatgptAccountId: "workspace-account" },
			]),
		).toEqual([personal, workspace]);
	});

	it("keeps only the first home for one account signed in from several homes", () => {
		const first = codexAccount("/home/.codex/auth.json", "dev@example.com");
		const second = codexAccount(
			"/home/.codex-copy/auth.json",
			"dev@example.com",
		);
		expect(
			dedupeCodexAccounts([
				{ account: first, chatgptAccountId: "personal-account" },
				{ account: second, chatgptAccountId: "personal-account" },
			]),
		).toEqual([first]);
	});

	it("keeps two seats of one workspace that belong to different people", () => {
		const alice = codexAccount(
			"/home/.codex-alice/auth.json",
			"alice@example.com",
		);
		const bob = codexAccount("/home/.codex-bob/auth.json", "bob@example.com");
		expect(
			dedupeCodexAccounts([
				{ account: alice, chatgptAccountId: "workspace-account" },
				{ account: bob, chatgptAccountId: "workspace-account" },
			]),
		).toEqual([alice, bob]);
	});

	it("keeps every home that has no email, such as API-key homes", () => {
		const first = codexAccount("/home/.codex-api/auth.json", null);
		const second = codexAccount("/home/.codex-api-2/auth.json", null);
		expect(
			dedupeCodexAccounts([
				{ account: first, chatgptAccountId: null },
				{ account: second, chatgptAccountId: null },
			]),
		).toEqual([first, second]);
	});

	it("keeps homes that share an email but state no account id", () => {
		const first = codexAccount("/home/.codex/auth.json", "dev@example.com");
		const second = codexAccount(
			"/home/.codex-work/auth.json",
			"dev@example.com",
		);
		expect(
			dedupeCodexAccounts([
				{ account: first, chatgptAccountId: null },
				{ account: second, chatgptAccountId: null },
			]),
		).toEqual([first, second]);
	});
});
