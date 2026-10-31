import { afterEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionCodexProfile } from "@superset/agent-setup";
import {
	API_BILLING_MARKER,
	claudeKeychainAccounts,
	discoverClaudeProfiles,
	discoverCodexHomes,
	PROFILE_CREATED_MARKER,
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
	// Provisioning (Make default, prepareAccount, host boot) writes this into
	// any home it touches, including homes Paradev did not create.
	const PROFILE_LEDGER = ".superset-profile.json";
	// A home the add-account command created, provisioned after its sign-in.
	const PARADEV_HOME = {
		[PROFILE_CREATED_MARKER]: "codex",
		[PROFILE_LEDGER]: "{}",
	};

	function codexDir(
		home: string,
		name: string,
		files: Record<string, string>,
	): string {
		const dir = join(home, name);
		mkdirSync(dir);
		for (const [file, content] of Object.entries(files)) {
			writeFileSync(join(dir, file), content);
		}
		return dir;
	}

	async function listed(home: string, dir: string) {
		return (await discoverCodexHomes(home)).find((entry) => entry.home === dir);
	}

	it("keeps a home Paradev created after its login is gone, as signed out", async () => {
		const home = tempProfile();
		const loggedOut = codexDir(home, ".codex-a", PARADEV_HOME);
		// Codex writes OPENAI_API_KEY even when it is null.
		const emptyLogin = codexDir(home, ".codex-b", {
			...PARADEV_HOME,
			"auth.json": JSON.stringify({
				auth_mode: "chatgpt",
				OPENAI_API_KEY: null,
				tokens: { id_token: "id", access_token: "", refresh_token: "" },
				last_refresh: "2026-09-11T12:00:00Z",
			}),
		});
		expect(await listed(home, loggedOut)).toMatchObject({
			credentialKind: "subscription",
			loginFingerprint: null,
			signedOut: true,
		});
		expect(await listed(home, emptyLogin)).toMatchObject({ signedOut: true });
	});

	// The add-account command writes the marker before the login runs.
	it("keeps a home hidden while its first sign-in has not completed", async () => {
		const home = tempProfile();
		codexDir(home, ".codex-new", { [PROFILE_CREATED_MARKER]: "codex\n" });
		expect((await discoverCodexHomes(home)).map((entry) => entry.home)).toEqual(
			[join(home, ".codex")],
		);
	});

	it("keeps a home with a token as a live subscription", async () => {
		const home = tempProfile();
		const live = codexDir(home, ".codex-c", {
			"auth.json": JSON.stringify({ tokens: { access_token: "test-token" } }),
		});
		expect(await listed(home, live)).toEqual({
			home: live,
			sourceLabel: expect.any(String),
			credentialKind: "subscription",
			loginFingerprint: null,
			signedOut: false,
		});
	});

	// Remove deletes the whole dir, so only a dir Paradev made may be offered.
	it("never lists a home Paradev did not create as signed out, even once it provisioned it", async () => {
		const home = tempProfile();
		codexDir(home, ".codex", { "config.toml": 'model = "m"\n' });
		const external = codexDir(home, ".codex-ext", {
			"auth.json": JSON.stringify({
				tokens: { access_token: "test-token", refresh_token: "rt" },
			}),
		});
		await provisionCodexProfile(external, { homeDir: home });
		expect(existsSync(join(external, PROFILE_LEDGER))).toBe(true);
		// The tool that keeps this login moves it aside while it rotates it.
		renameSync(join(external, "auth.json"), join(home, "parked-auth.json"));
		codexDir(home, ".codex-ledger", { [PROFILE_LEDGER]: "{}" });
		codexDir(home, ".codex-claude", {
			...PARADEV_HOME,
			[PROFILE_CREATED_MARKER]: "claude",
		});
		const markerDir = codexDir(home, ".codex-marker-dir", {
			[PROFILE_LEDGER]: "{}",
		});
		mkdirSync(join(markerDir, PROFILE_CREATED_MARKER));

		expect((await discoverCodexHomes(home)).map((entry) => entry.home)).toEqual(
			[join(home, ".codex")],
		);
	});

	describe("does not read a login stored outside the access token as signed out", () => {
		// auth.json as Codex writes each kind of login.
		const logins: Array<[string, Record<string, unknown>]> = [
			["an API key", { auth_mode: "apikey", OPENAI_API_KEY: "sk-test" }],
			[
				"a personal access token",
				{ OPENAI_API_KEY: null, personal_access_token: "pat-test" },
			],
			[
				"an agent identity",
				{
					auth_mode: "agentIdentity",
					OPENAI_API_KEY: null,
					agent_identity: "header.payload.signature",
				},
			],
			[
				"an agent identity record",
				{
					OPENAI_API_KEY: null,
					agent_identity: { agent_runtime_id: "rt-1", agent_private_key: "k" },
				},
			],
			[
				"a Bedrock API key",
				{
					OPENAI_API_KEY: null,
					bedrock_api_key: { api_key: "key", region: "us-east-1" },
				},
			],
			[
				"Bedrock access keys",
				{
					OPENAI_API_KEY: null,
					bedrock_access_keys: {
						access_key_id: "id",
						secret_access_key: "secret",
					},
				},
			],
			[
				"a refresh token without an access token",
				{
					OPENAI_API_KEY: null,
					tokens: { access_token: "", refresh_token: "rt" },
				},
			],
			[
				"a field this reader does not know",
				{ OPENAI_API_KEY: null, future_login: { token: "t" } },
			],
		];
		for (const [kind, auth] of logins) {
			it(kind, async () => {
				const home = tempProfile();
				const dir = codexDir(home, ".codex-a", {
					...PARADEV_HOME,
					"auth.json": JSON.stringify(auth),
				});
				expect((await listed(home, dir))?.signedOut ?? false).toBe(false);
			});
		}
	});

	it("does not read a home whose login is kept in the OS keyring as signed out", async () => {
		const home = tempProfile();
		// Codex then deletes auth.json. Provisioning copies config.toml from
		// the default home, so the setting can reach every profile.
		const keyring = codexDir(home, ".codex-keyring", {
			...PARADEV_HOME,
			"config.toml": 'model = "m"\ncli_auth_credentials_store = "keyring"\n',
		});
		const auto = codexDir(home, ".codex-auto", {
			...PARADEV_HOME,
			"config.toml": "cli_auth_credentials_store = 'auto' # keyring if any\n",
		});
		const file = codexDir(home, ".codex-file", {
			...PARADEV_HOME,
			"config.toml":
				'# cli_auth_credentials_store = "keyring"\ncli_auth_credentials_store = "file"\n',
		});
		expect((await listed(home, keyring))?.signedOut ?? false).toBe(false);
		expect((await listed(home, auto))?.signedOut ?? false).toBe(false);
		expect(await listed(home, file)).toMatchObject({ signedOut: true });
	});

	it("leaves an auth.json it cannot read as a file alone", async () => {
		const home = tempProfile();
		const link = codexDir(home, ".codex-link", PARADEV_HOME);
		symlinkSync(join(home, "store", "auth.json"), join(link, "auth.json"));
		const directory = codexDir(home, ".codex-dir", PARADEV_HOME);
		mkdirSync(join(directory, "auth.json"));
		// A half-written auth.json is a login being saved.
		codexDir(home, ".codex-partial", {
			...PARADEV_HOME,
			"auth.json": '{"tokens": {"access_tok',
		});
		expect((await discoverCodexHomes(home)).map((entry) => entry.home)).toEqual(
			[join(home, ".codex")],
		);
	});

	it("lists the default home first, without a login and never as signed out", async () => {
		const home = tempProfile();
		codexDir(home, ".codex", PARADEV_HOME);
		codexDir(home, ".codex-a", PARADEV_HOME);
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
