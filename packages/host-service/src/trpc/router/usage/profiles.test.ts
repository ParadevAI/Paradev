import { afterEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	API_BILLING_MARKER,
	claudeKeychainAccounts,
	discoverClaudeProfiles,
	discoverCodexHomes,
	readCodexProfileKind,
} from "./profiles";

// Claude Code keys its Keychain items on these names; a miss reads a sibling
// item (or nothing) and the login disappears from the quota panel.
describe("claudeKeychainAccounts", () => {
	it("uses $USER alone when it is set, as the CLI does", () => {
		expect(claudeKeychainAccounts({ USER: "avi" }, () => "passwd")).toEqual([
			"avi",
		]);
	});

	it("without $USER probes the passwd name and Bun's 'unknown' identity", () => {
		expect(claudeKeychainAccounts({}, () => "passwd")).toEqual([
			"passwd",
			"unknown",
		]);
		expect(claudeKeychainAccounts({ USER: "" }, () => "passwd")).toEqual([
			"passwd",
			"unknown",
		]);
	});

	it("swaps an unusable name for the CLI's fixed fallback", () => {
		expect(claudeKeychainAccounts({ USER: "not valid!" }, () => "x")).toEqual([
			"claude-code-user",
		]);
		expect(
			claudeKeychainAccounts({}, () => {
				throw new Error("no passwd entry");
			}),
		).toEqual(["claude-code-user", "unknown"]);
	});
});

const roots: string[] = [];

function tempProfile(): string {
	const root = mkdtempSync(join(tmpdir(), "superset-usage-profile-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("readCodexProfileKind", () => {
	it("classifies a marked home as API-billed without opening auth.json", async () => {
		const home = tempProfile();
		writeFileSync(join(home, API_BILLING_MARKER), "codex\n");
		// An unreadable auth.json (a directory) proves the key file is never
		// opened on this path.
		mkdirSync(join(home, "auth.json"));

		expect(await readCodexProfileKind(home)).toMatchObject({
			credentialKind: "api_key",
		});
	});

	it("fingerprints an API home by the marker's mtime so a re-login is visible", async () => {
		const home = tempProfile();
		const marker = join(home, API_BILLING_MARKER);
		writeFileSync(marker, "codex");
		utimesSync(marker, new Date(1_000_000), new Date(1_000_000));
		const first = (await readCodexProfileKind(home))?.loginFingerprint;
		utimesSync(marker, new Date(2_000_000), new Date(2_000_000));
		const second = (await readCodexProfileKind(home))?.loginFingerprint;

		expect(first).toBeTruthy();
		expect(second).toBeTruthy();
		expect(second).not.toBe(first);
	});

	it("classifies an OAuth token as a subscription", async () => {
		const home = tempProfile();
		writeFileSync(
			join(home, "auth.json"),
			JSON.stringify({ tokens: { access_token: "test-token" } }),
		);

		expect(await readCodexProfileKind(home)).toEqual({
			credentialKind: "subscription",
			loginFingerprint: null,
		});
	});

	it("ignores another agent's marker", async () => {
		const home = tempProfile();
		writeFileSync(join(home, API_BILLING_MARKER), "claude");
		expect(await readCodexProfileKind(home)).toBeNull();
	});

	it("ignores an unmarked API-key auth.json and a missing one", async () => {
		const home = tempProfile();
		expect(await readCodexProfileKind(home)).toBeNull();
		writeFileSync(
			join(home, "auth.json"),
			JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-test" }),
		);
		expect(await readCodexProfileKind(home)).toBeNull();
	});
});

describe("discoverClaudeProfiles", () => {
	it("surfaces a marked dir as API-billed even without an OAuth identity", async () => {
		const dir = tempProfile();
		writeFileSync(join(dir, API_BILLING_MARKER), "claude");

		const [profile] = await discoverClaudeProfiles([dir]);
		expect(profile).toMatchObject({
			configDir: dir,
			email: null,
			credentialKind: "api_key",
		});
		expect(profile?.loginFingerprint).toBeTruthy();
	});

	it("keeps an OAuth identity a subscription and skips dirs with neither", async () => {
		const subscription = tempProfile();
		writeFileSync(
			join(subscription, ".claude.json"),
			JSON.stringify({ oauthAccount: { emailAddress: "a@b.c" } }),
		);
		const empty = tempProfile();
		// A Codex API home sits in the same ~ dot-dir scan and must not
		// double as a Claude profile.
		const codexApi = tempProfile();
		writeFileSync(join(codexApi, API_BILLING_MARKER), "codex");

		const profiles = await discoverClaudeProfiles([
			subscription,
			empty,
			codexApi,
		]);
		expect(profiles).toHaveLength(1);
		expect(profiles[0]).toMatchObject({
			configDir: subscription,
			email: "a@b.c",
			credentialKind: "subscription",
			loginFingerprint: null,
		});
	});
});

describe("discoverCodexHomes", () => {
	const PROFILE_LEDGER = ".superset-profile.json";

	function codexDir(home: string, name: string, files: Record<string, string>) {
		mkdirSync(join(home, name));
		for (const [file, content] of Object.entries(files)) {
			writeFileSync(join(home, name, file), content);
		}
		return join(home, name);
	}

	it("keeps a home Superset set up after its login is gone, as signed out", async () => {
		const home = tempProfile();
		const signedOut = codexDir(home, ".codex-a", { [PROFILE_LEDGER]: "{}" });
		const emptyLogin = codexDir(home, ".codex-b", {
			[PROFILE_LEDGER]: "{}",
			"auth.json": JSON.stringify({ OPENAI_API_KEY: null, tokens: null }),
		});
		const homes = await discoverCodexHomes(home);
		expect(homes.find((entry) => entry.home === signedOut)).toMatchObject({
			credentialKind: "subscription",
			loginFingerprint: null,
			signedOut: true,
		});
		expect(homes.find((entry) => entry.home === emptyLogin)).toMatchObject({
			signedOut: true,
		});
	});

	it("keeps a home with a token as a live subscription", async () => {
		const home = tempProfile();
		const live = codexDir(home, ".codex-c", {
			"auth.json": JSON.stringify({ tokens: { access_token: "test-token" } }),
		});
		expect(
			(await discoverCodexHomes(home)).find((entry) => entry.home === live),
		).toEqual({
			home: live,
			sourceLabel: expect.any(String),
			credentialKind: "subscription",
			loginFingerprint: null,
			signedOut: false,
		});
	});

	it("skips dirs without the ledger, and logins it cannot classify", async () => {
		const home = tempProfile();
		codexDir(home, ".codex-b", {});
		// An unmarked API key and a half-written auth.json are logins, not sign-outs.
		codexDir(home, ".codex-key", {
			[PROFILE_LEDGER]: "{}",
			"auth.json": JSON.stringify({ OPENAI_API_KEY: "sk-test" }),
		});
		codexDir(home, ".codex-partial", {
			[PROFILE_LEDGER]: "{}",
			"auth.json": '{"tokens": {"access_tok',
		});
		expect((await discoverCodexHomes(home)).map((entry) => entry.home)).toEqual(
			[join(home, ".codex")],
		);
	});

	it("lists the default home first, without a login and never as signed out", async () => {
		const home = tempProfile();
		codexDir(home, ".codex", { [PROFILE_LEDGER]: "{}" });
		codexDir(home, ".codex-a", { [PROFILE_LEDGER]: "{}" });
		const homes = await discoverCodexHomes(home);
		expect(homes[0]).toMatchObject({
			home: join(home, ".codex"),
			credentialKind: "subscription",
			signedOut: false,
		});
		expect(homes.map((entry) => entry.home)).toEqual([
			join(home, ".codex"),
			join(home, ".codex-a"),
		]);
	});
});
