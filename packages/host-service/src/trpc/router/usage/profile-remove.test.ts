import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertCodexHomeStillRemovable,
	assertRemovableProfileDir,
	removeClaudeProfile,
	removeCodexHome,
} from "./profile-remove";
import { PROFILE_CREATED_MARKER } from "./profiles";

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
				symlinkSync(sharedSkills, join(profile, "skills"), "dir");

				await removeClaudeProfile(profile);

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

// Remove acts on a card from the cached quota list, which can be minutes old,
// so the home is read again before anything is deleted.
describe("assertCodexHomeStillRemovable", () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	/** A fake home dir holding a signed-out Codex home that Paradev created. */
	function signedOutProfile(): { home: string; profile: string } {
		const home = mkdtempSync(join(tmpdir(), "superset-profile-recheck-"));
		roots.push(home);
		const profile = join(home, ".codex-work");
		mkdirSync(profile);
		writeFileSync(join(profile, PROFILE_CREATED_MARKER), "codex");
		writeFileSync(join(profile, ".superset-profile.json"), "{}");
		return { home, profile };
	}

	function signIn(codexHome: string): void {
		mkdirSync(codexHome, { recursive: true });
		writeFileSync(
			join(codexHome, "auth.json"),
			JSON.stringify({ tokens: { access_token: "test-token" } }),
		);
	}

	it("accepts a home shown as signed out that still holds no login", async () => {
		const { home, profile } = signedOutProfile();
		await expect(
			assertCodexHomeStillRemovable(profile, "signed_out", home),
		).resolves.toBeUndefined();
	});

	it("keeps a home shown as signed out once a login is back", async () => {
		const { home, profile } = signedOutProfile();
		signIn(profile);
		await expect(
			assertCodexHomeStillRemovable(profile, "signed_out", home),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining(profile),
		});
	});

	it("accepts a signed-in home shown as signed in", async () => {
		const { home, profile } = signedOutProfile();
		signIn(profile);
		await expect(
			assertCodexHomeStillRemovable(profile, "ok", home),
		).resolves.toBeUndefined();
	});

	it("refuses a home no longer discovered, and the default home", async () => {
		const { home } = signedOutProfile();
		// Another tool's home that it provisioned, with its login moved aside.
		const external = join(home, ".codex-ext");
		mkdirSync(external);
		writeFileSync(join(external, ".superset-profile.json"), "{}");
		const defaultHome = join(home, ".codex");
		signIn(defaultHome);
		for (const dir of [external, defaultHome, join(home, ".codex-gone")]) {
			await expect(
				assertCodexHomeStillRemovable(dir, "ok", home),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
	});
});
