import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertRemovableProfileDir,
	removeClaudeProfile,
	removeCodexHome,
} from "./profile-remove";
import { keychainServicesForConfigDir } from "./profiles";

// The add-account command writes this, holding the agent id, into each
// profile dir it creates.
const CREATED_MARKER = ".superset-created";

// These guard a recursive delete — every rejection here is load-bearing.
describe("assertRemovableProfileDir", () => {
	it("rejects anything outside the home dir", () => {
		expect(() => assertRemovableProfileDir("/")).toThrow(/outside the home/);
		expect(() => assertRemovableProfileDir("/tmp/claude-profile")).toThrow(
			/outside the home/,
		);
		expect(() => assertRemovableProfileDir(homedir())).toThrow();
	});

	it("rejects every system-default home", () => {
		for (const dir of [
			join(homedir(), ".claude"),
			join(homedir(), ".config", "claude"),
			join(homedir(), ".config"),
			join(homedir(), ".codex"),
		]) {
			expect(() => assertRemovableProfileDir(dir)).toThrow(/system-default/);
		}
	});

	it("rejects path traversal that resolves to a protected dir", () => {
		expect(() =>
			assertRemovableProfileDir(
				join(homedir(), ".claude-work", "..", ".claude"),
			),
		).toThrow(/system-default/);
		expect(() =>
			assertRemovableProfileDir(join(homedir(), ".claude-work", "..", "..")),
		).toThrow(/outside the home/);
	});

	it("accepts a profile dir under the home dir", () => {
		const dir = join(homedir(), ".claude-unittest-profile");
		expect(assertRemovableProfileDir(dir)).toBe(dir);
	});
});

describe("assertRemovableProfileDir with Codex account injection", () => {
	let previousCodexHome: string | undefined;
	let previousInjectedHome: string | undefined;
	let previousAmbientHome: string | undefined;

	beforeEach(() => {
		previousCodexHome = process.env.CODEX_HOME;
		previousInjectedHome = process.env.SUPERSET_DEFAULT_CODEX_HOME;
		previousAmbientHome = process.env.SUPERSET_AMBIENT_CODEX_HOME;
	});

	afterEach(() => {
		if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
		else process.env.CODEX_HOME = previousCodexHome;
		if (previousInjectedHome === undefined)
			delete process.env.SUPERSET_DEFAULT_CODEX_HOME;
		else process.env.SUPERSET_DEFAULT_CODEX_HOME = previousInjectedHome;
		if (previousAmbientHome === undefined)
			delete process.env.SUPERSET_AMBIENT_CODEX_HOME;
		else process.env.SUPERSET_AMBIENT_CODEX_HOME = previousAmbientHome;
	});

	it("allows removal of a profile Paradev injected into CODEX_HOME", () => {
		const profile = join(homedir(), ".codex-injected-profile");
		process.env.CODEX_HOME = profile;
		process.env.SUPERSET_DEFAULT_CODEX_HOME = profile;
		delete process.env.SUPERSET_AMBIENT_CODEX_HOME;
		expect(assertRemovableProfileDir(profile)).toBe(profile);
	});

	it("protects a preserved custom default while allowing the injected profile", () => {
		const profile = join(homedir(), ".codex-injected-profile");
		const customDefault = join(homedir(), ".codex-user-default");
		process.env.CODEX_HOME = profile;
		process.env.SUPERSET_DEFAULT_CODEX_HOME = profile;
		process.env.SUPERSET_AMBIENT_CODEX_HOME = customDefault;

		expect(() => assertRemovableProfileDir(customDefault)).toThrow(
			/system-default/,
		);
		expect(assertRemovableProfileDir(profile)).toBe(profile);
	});

	it("still protects a CODEX_HOME the user set themselves", () => {
		const customDefault = join(homedir(), ".codex-user-default");
		process.env.CODEX_HOME = customDefault;
		delete process.env.SUPERSET_DEFAULT_CODEX_HOME;
		delete process.env.SUPERSET_AMBIENT_CODEX_HOME;
		expect(() => assertRemovableProfileDir(customDefault)).toThrow(
			/system-default/,
		);
	});
});

describe("remove functions refuse protected dirs before touching the disk", () => {
	it("removeClaudeProfile throws on the default home", async () => {
		await expect(
			removeClaudeProfile(join(homedir(), ".claude")),
		).rejects.toThrow(/system-default/);
	});

	it("removeCodexHome throws on the default home", async () => {
		await expect(removeCodexHome(join(homedir(), ".codex"))).rejects.toThrow(
			/system-default/,
		);
	});
});

// Discovery lists any signed-in dot-dir, including homes the user or another
// tool made and still uses. Remove must leave those, and their Keychain
// items, alone.
describe("remove functions delete only profiles Paradev created", () => {
	const profiles: string[] = [];
	afterEach(() => {
		for (const dir of profiles.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	// Under the home dir so the path guards accept it.
	function makeProfile(prefix: string, files: Record<string, string>): string {
		const dir = mkdtempSync(join(homedir(), prefix));
		profiles.push(dir);
		for (const [name, content] of Object.entries(files)) {
			writeFileSync(join(dir, name), content);
		}
		return dir;
	}

	it("keeps a Codex home it did not create", async () => {
		const dir = makeProfile(".codex-remove-test-", {
			"auth.json": '{"tokens":{"access_token":"token"}}',
		});

		await expect(removeCodexHome(dir)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining(dir),
		});
		expect(readdirSync(dir)).toEqual(["auth.json"]);
	});

	it("keeps a Claude profile it did not create, and its Keychain items", async () => {
		const dir = makeProfile(".claude-remove-test-", {
			".claude.json": '{"oauthAccount":{"emailAddress":"me@example.com"}}',
		});
		const deleteKeychainItem = mock(async (_service: string) => {});

		await expect(
			removeClaudeProfile(dir, deleteKeychainItem),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(deleteKeychainItem).not.toHaveBeenCalled();
		expect(readdirSync(dir)).toEqual([".claude.json"]);
	});

	it("keeps a home marked as created for the other agent", async () => {
		const dir = makeProfile(".codex-remove-test-", {
			[CREATED_MARKER]: "claude",
		});

		await expect(removeCodexHome(dir)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(existsSync(dir)).toBe(true);
	});

	it("deletes a Codex home it created", async () => {
		const dir = makeProfile(".codex-remove-test-", {
			[CREATED_MARKER]: "codex",
			"auth.json": '{"tokens":{"access_token":"token"}}',
		});

		await removeCodexHome(dir);

		expect(existsSync(dir)).toBe(false);
	});

	it("deletes a Claude profile it created, with its Keychain items", async () => {
		const dir = makeProfile(".claude-remove-test-", {
			[CREATED_MARKER]: "claude",
		});
		const deleted: string[] = [];

		await removeClaudeProfile(dir, async (service) => {
			deleted.push(service);
		});

		expect(existsSync(dir)).toBe(false);
		expect(deleted).toEqual(keychainServicesForConfigDir(dir));
	});
});

// A provisioned profile links its capability dirs at the default account's
// (packages/agent-setup/src/provider-profiles.ts). Removing the profile must
// unlink those, never delete through them.
describe("removeClaudeProfile with shared-config links", () => {
	it("leaves the default account's linked dirs intact", async () => {
		const root = mkdtempSync(join(tmpdir(), "superset-profile-remove-"));
		try {
			const sharedSkills = join(root, "default-skills");
			mkdirSync(join(sharedSkills, "redesign"), { recursive: true });
			writeFileSync(join(sharedSkills, "redesign", "SKILL.md"), "# redesign");

			// Under the home dir so the removal guards accept it.
			const profile = mkdtempSync(join(homedir(), ".claude-remove-test-"));
			try {
				writeFileSync(join(profile, CREATED_MARKER), "claude");
				symlinkSync(sharedSkills, join(profile, "skills"), "dir");

				await removeClaudeProfile(profile, async () => {});

				expect(existsSync(profile)).toBe(false);
				expect(existsSync(join(sharedSkills, "redesign", "SKILL.md"))).toBe(
					true,
				);
			} finally {
				rmSync(profile, { recursive: true, force: true });
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
