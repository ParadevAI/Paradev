import { afterEach, describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: shell integration test runs the generated command in a temporary home
import * as fs from "node:fs";
// biome-ignore lint/style/noRestrictedImports: shell integration test runs the generated command in a temporary home
import { tmpdir } from "node:os";
// biome-ignore lint/style/noRestrictedImports: shell integration test runs the generated command in a temporary home
import { join } from "node:path";
import type { AccountCredentialKind } from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";
import { addAccountCommand } from "./addAccountCommand";

// host-service's profile-remove.ts deletes only dirs that hold this marker.
const CREATED_MARKER = ".superset-created";
const API_BILLING_MARKER = ".superset-api-billing";
const AGENTS = ["claude", "codex"] as const;
const CREDENTIAL_KINDS = ["subscription", "api_key"] as const;

const LOGIN_ARGS: Record<
	ManagedAgent,
	Record<AccountCredentialKind, string>
> = {
	claude: { subscription: "auth login", api_key: "auth login --console" },
	codex: { subscription: "login", api_key: "login --with-api-key" },
};

/** Files that hold a login, as host-service's profile discovery reads them. */
const LOGIN_FILES: Record<ManagedAgent, Record<string, string>> = {
	claude: {
		".claude.json": '{"oauthAccount":{"emailAddress":"me@example.com"}}',
		".credentials.json": '{"claudeAiOauth":{"accessToken":"token"}}',
		[API_BILLING_MARKER]: "claude",
	},
	codex: {
		"auth.json": '{"tokens":{"access_token":"token"}}',
		[API_BILLING_MARKER]: "codex",
	},
};

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) {
		fs.rmSync(home, { recursive: true, force: true });
	}
});

/** A temporary $HOME whose bin/ holds stub CLIs that record their calls. */
function makeHome(): string {
	const home = fs.mkdtempSync(join(tmpdir(), "superset-add-account-"));
	homes.push(home);
	fs.mkdirSync(join(home, "bin"));
	const dirVars: Record<ManagedAgent, string> = {
		claude: "CLAUDE_CONFIG_DIR",
		codex: "CODEX_HOME",
	};
	for (const [cli, dirVar] of Object.entries(dirVars)) {
		fs.writeFileSync(
			join(home, "bin", cli),
			`#!/bin/sh\ncat >/dev/null\nprintf '%s|%s' "$${dirVar}" "$*" > "$HOME/${cli}.calls"\nexit "\${STUB_EXIT:-0}"\n`,
			{ mode: 0o755 },
		);
	}
	return home;
}

function makeProfileDir(
	home: string,
	agent: ManagedAgent,
	files: Record<string, string>,
): string {
	const dir = join(home, `.${agent}-work`);
	fs.mkdirSync(dir);
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(join(dir, name), content);
	}
	return dir;
}

function snapshot(dir: string): Record<string, string> {
	return Object.fromEntries(
		fs
			.readdirSync(dir)
			.sort()
			.map((name) => [name, fs.readFileSync(join(dir, name), "utf8")]),
	);
}

function run(
	home: string,
	agent: ManagedAgent,
	credentialKind: AccountCredentialKind = "subscription",
	stubExit = 0,
) {
	// Codex's API login reads the key with `read -s`, which POSIX sh lacks;
	// the embedded terminal runs the user's shell (bash or zsh).
	const shell =
		agent === "codex" && credentialKind === "api_key" ? "bash" : "sh";
	const result = Bun.spawnSync({
		cmd: [shell, "-c", addAccountCommand(agent, "work", credentialKind)],
		env: {
			HOME: home,
			PATH: `${join(home, "bin")}:/usr/bin:/bin`,
			STUB_EXIT: `${stubExit}`,
		},
		stdin: new TextEncoder().encode("fake-test-key\n"),
	});
	const callsPath = join(home, `${agent}.calls`);
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		calls: fs.existsSync(callsPath) ? fs.readFileSync(callsPath, "utf8") : null,
	};
}

describe("addAccountCommand", () => {
	it("leaves $HOME to the user's shell and stays on one line", () => {
		for (const agent of AGENTS) {
			for (const credentialKind of CREDENTIAL_KINDS) {
				const command = addAccountCommand(agent, "work", credentialKind);
				expect(command).toContain(`"$HOME/.${agent}-work"`);
				expect(command).not.toContain("\n");
			}
		}
	});

	for (const agent of AGENTS) {
		describe(agent, () => {
			for (const credentialKind of CREDENTIAL_KINDS) {
				it(`creates and marks a new dir, then signs in there (${credentialKind})`, () => {
					const home = makeHome();
					const dir = join(home, `.${agent}-work`);

					const result = run(home, agent, credentialKind);

					expect(result.exitCode).toBe(0);
					expect(fs.readFileSync(join(dir, CREATED_MARKER), "utf8")).toBe(
						agent,
					);
					expect(result.calls).toBe(
						`${dir}|${LOGIN_ARGS[agent][credentialKind]}`,
					);
				});

				it(`leaves a signed-in dir it did not create untouched (${credentialKind})`, () => {
					const home = makeHome();
					const [name, content] = Object.entries(LOGIN_FILES[agent])[0];
					const dir = makeProfileDir(home, agent, { [name]: content });
					const before = snapshot(dir);

					const result = run(home, agent, credentialKind);

					expect(result.exitCode).not.toBe(0);
					expect(result.stderr).toContain(`${dir} already exists`);
					expect(result.calls).toBeNull();
					expect(snapshot(dir)).toEqual(before);
				});
			}

			it("refuses an empty dir it did not create", () => {
				const home = makeHome();
				const dir = makeProfileDir(home, agent, {});

				const result = run(home, agent);

				expect(result.exitCode).not.toBe(0);
				expect(result.calls).toBeNull();
				expect(fs.readdirSync(dir)).toEqual([]);
			});

			it("signs in again to its own dir while no login landed there", () => {
				const home = makeHome();
				const dir = makeProfileDir(home, agent, {
					[CREATED_MARKER]: agent,
					// A cancelled Claude sign-in can leave state without an account.
					...(agent === "claude" ? { ".claude.json": "{}" } : {}),
				});

				const result = run(home, agent);

				expect(result.exitCode).toBe(0);
				expect(result.calls).toBe(`${dir}|${LOGIN_ARGS[agent].subscription}`);
			});

			for (const [name, content] of Object.entries(LOGIN_FILES[agent])) {
				it(`refuses its own dir once ${name} holds a login`, () => {
					const home = makeHome();
					const dir = makeProfileDir(home, agent, {
						[CREATED_MARKER]: agent,
						[name]: content,
					});
					const before = snapshot(dir);

					const result = run(home, agent);

					expect(result.exitCode).not.toBe(0);
					expect(result.calls).toBeNull();
					expect(snapshot(dir)).toEqual(before);
				});
			}

			for (const stubExit of [0, 1]) {
				it(`marks API billing only after the login exits 0 (exit ${stubExit})`, () => {
					const home = makeHome();
					const dir = join(home, `.${agent}-work`);

					const result = run(home, agent, "api_key", stubExit);

					expect(result.exitCode).toBe(stubExit);
					expect(fs.existsSync(join(dir, API_BILLING_MARKER))).toBe(
						stubExit === 0,
					);
				});
			}
		});
	}
});
