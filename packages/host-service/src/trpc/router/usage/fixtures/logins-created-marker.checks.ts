import { expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { HostServiceContext } from "../../../../types";
import { PROFILE_CREATED_MARKER } from "../profiles";
import { usageRouter } from "../usage";

// Run by usage.test.ts with HOME set to a temporary dir. Add account takes a
// new profile's sign-in only from a dir its own command created, so logins
// must say which dirs those are.
it("reports which profile dirs Paradev created", async () => {
	const home = homedir();
	expect(home.startsWith(tmpdir())).toBe(true);
	const profileDir = (name: string, files: Record<string, string>) => {
		const dir = join(home, name);
		mkdirSync(dir);
		for (const [file, content] of Object.entries(files)) {
			writeFileSync(join(dir, file), content);
		}
		return dir;
	};
	const codexAuth = '{"tokens":{"access_token":"token"}}';
	const claudeState = '{"oauthAccount":{"emailAddress":"me@example.com"}}';
	const codexMade = profileDir(".codex-made", {
		"auth.json": codexAuth,
		[PROFILE_CREATED_MARKER]: "codex",
	});
	const codexOwn = profileDir(".codex-own", { "auth.json": codexAuth });
	const claudeMade = profileDir(".claude-made", {
		".claude.json": claudeState,
		[PROFILE_CREATED_MARKER]: "claude",
	});
	const claudeOwn = profileDir(".claude-own", { ".claude.json": claudeState });

	const logins = await usageRouter
		.createCaller({ isAuthenticated: true } as HostServiceContext)
		.logins();

	expect(
		Object.fromEntries(
			logins.codex.map((login) => [login.home, login.createdByParadev]),
		),
	).toEqual({
		[join(home, ".codex")]: false,
		[codexMade]: true,
		[codexOwn]: false,
	});
	expect(
		Object.fromEntries(
			logins.claude.map((login) => [login.configDir, login.createdByParadev]),
		),
	).toEqual({ [claudeMade]: true, [claudeOwn]: false });
});
