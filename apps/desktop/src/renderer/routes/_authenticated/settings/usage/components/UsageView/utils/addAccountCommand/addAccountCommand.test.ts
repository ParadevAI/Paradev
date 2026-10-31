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
const KEY = "fake-test-key";

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

/**
 * A temporary $HOME whose bin/ holds stub CLIs that record their calls. Only
 * a key login reads stdin, so a stub leaves the rest of a pasted input to
 * the shell.
 */
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
			`#!/bin/sh\ncase "$*" in *--with-api-key*) cat > "$HOME/${cli}.stdin" ;; esac\nprintf '%s|%s' "$${dirVar}" "$*" > "$HOME/${cli}.calls"\nexit "\${STUB_EXIT:-0}"\n`,
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

function readIfPresent(path: string): string | null {
	return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : null;
}

/** Runs `cmd` in `home` with only the stub CLIs and the system dirs on PATH. */
function spawn(
	home: string,
	cmd: string[],
	{ stdin = `${KEY}\n`, env = {} }: { stdin?: string; env?: object } = {},
) {
	const result = Bun.spawnSync({
		cmd,
		env: { HOME: home, PATH: `${join(home, "bin")}:/usr/bin:/bin`, ...env },
		stdin: new TextEncoder().encode(stdin),
	});
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function calls(home: string, agent: ManagedAgent): string | null {
	return readIfPresent(join(home, `${agent}.calls`));
}

function run(
	home: string,
	agent: ManagedAgent,
	credentialKind: AccountCredentialKind = "subscription",
	stubExit = 0,
) {
	const result = spawn(
		home,
		["sh", "-c", addAccountCommand(agent, "work", credentialKind)],
		{ env: { STUB_EXIT: `${stubExit}` } },
	);
	return { ...result, calls: calls(home, agent) };
}

describe("addAccountCommand", () => {
	it("leaves $HOME to the shell and stays on one line", () => {
		for (const agent of AGENTS) {
			for (const credentialKind of CREDENTIAL_KINDS) {
				const command = addAccountCommand(agent, "work", credentialKind);
				expect(command).toContain(`"$HOME/.${agent}-work"`);
				expect(command).not.toContain("\n");
			}
		}
	});

	// fish has no subshells and reads `\\` and `\'` inside single quotes, so
	// only a single-quoted sh script with neither parses the same everywhere.
	it("is one sh -c script that every login shell passes to sh unchanged", () => {
		for (const agent of AGENTS) {
			for (const credentialKind of CREDENTIAL_KINDS) {
				const command = addAccountCommand(agent, "work", credentialKind);
				const script = /^sh -c '([^']*)'$/.exec(command)?.[1];
				expect(script).toBeDefined();
				expect(script).not.toMatch(/\\[\\']/);
			}
		}
	});

	it("refuses a name that is not a slug", () => {
		for (const slug of ["", "Work", "a b", "it's", "../x", "$(id)"]) {
			expect(() => addAccountCommand("codex", slug, "subscription")).toThrow();
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

			it("marks the dir before the login, so Try again works after a cancelled sign-in", () => {
				const home = makeHome();
				const dir = join(home, `.${agent}-work`);

				expect(run(home, agent, "subscription", 1).exitCode).toBe(1);
				fs.rmSync(join(home, `${agent}.calls`));
				const retry = run(home, agent);

				expect(retry.exitCode).toBe(0);
				expect(retry.calls).toBe(`${dir}|${LOGIN_ARGS[agent].subscription}`);
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

	it("pipes the Codex key to the CLI and never prints it", () => {
		const home = makeHome();

		const result = run(home, "codex", "api_key");

		expect(result.exitCode).toBe(0);
		expect(readIfPresent(join(home, "codex.stdin"))).toBe(KEY);
		expect(result.stdout).not.toContain(KEY);
		expect(result.stderr).not.toContain(KEY);
	});
});

/** A user config that turns `mkdir` into `mkdir -p`, which succeeds on an existing dir. */
const USER_MKDIR = {
	alias: {
		posix: "alias mkdir='mkdir -p'",
		fish: "alias mkdir 'mkdir -p'",
	},
	function: {
		posix: 'mkdir() { command mkdir -p "$@"; }',
		fish: "function mkdir; command mkdir -p $argv; end",
	},
} as const;

/**
 * The user's shells, with their config loaded the way an interactive paste
 * (bash, zsh) or the embedded terminal's `<shell> -c` (fish) loads it.
 * Shells missing on this machine are skipped.
 */
const USER_SHELLS = [
	{
		name: "bash",
		path: Bun.which("bash"),
		run: (bin: string, home: string, rc: string, input: string) => {
			fs.writeFileSync(join(home, "rc"), `${rc}\n`);
			return spawn(
				home,
				[bin, "--noprofile", "--rcfile", join(home, "rc"), "-i"],
				{
					stdin: `${input}\necho next\n`,
				},
			);
		},
		config: "posix",
	},
	{
		name: "zsh",
		path: Bun.which("zsh"),
		run: (bin: string, home: string, rc: string, input: string) => {
			fs.writeFileSync(join(home, ".zshrc"), `${rc}\n`);
			return spawn(home, [bin, "-d", "-i"], {
				stdin: `${input}\necho next\n`,
				env: { ZDOTDIR: home },
			});
		},
		config: "posix",
	},
	{
		name: "fish",
		path: Bun.which("fish"),
		run: (bin: string, home: string, rc: string, input: string) => {
			fs.mkdirSync(join(home, ".config", "fish"), { recursive: true });
			fs.writeFileSync(join(home, ".config", "fish", "config.fish"), `${rc}\n`);
			return spawn(home, [bin, "-c", `${input}; echo next`], {
				env: { XDG_CONFIG_HOME: join(home, ".config") },
			});
		},
		config: "fish",
	},
] as const;

describe("addAccountCommand in the user's shell", () => {
	for (const shell of USER_SHELLS) {
		describe.skipIf(!shell.path)(shell.name, () => {
			const bin = shell.path ?? shell.name;

			it("creates and signs in to a new dir", () => {
				for (const agent of AGENTS) {
					const home = makeHome();
					const dir = join(home, `.${agent}-work`);

					const result = shell.run(
						bin,
						home,
						"",
						addAccountCommand(agent, "work", "subscription"),
					);

					expect(result.stdout).toContain("next");
					expect(calls(home, agent)).toBe(
						`${dir}|${LOGIN_ARGS[agent].subscription}`,
					);
					expect(fs.readFileSync(join(dir, CREATED_MARKER), "utf8")).toBe(
						agent,
					);
				}
			});

			for (const [kind, config] of Object.entries(USER_MKDIR)) {
				it(`leaves a signed-in dir alone when the user's mkdir is a ${kind} for mkdir -p`, () => {
					for (const agent of AGENTS) {
						const home = makeHome();
						const [name, content] = Object.entries(LOGIN_FILES[agent])[0];
						const dir = makeProfileDir(home, agent, { [name]: content });
						const before = snapshot(dir);

						const result = shell.run(
							bin,
							home,
							config[shell.config],
							addAccountCommand(agent, "work", "subscription"),
						);

						expect(result.stderr).toContain(`${dir} already exists`);
						expect(calls(home, agent)).toBeNull();
						expect(snapshot(dir)).toEqual(before);
						// A refusal ends the script, not the user's shell.
						expect(result.stdout).toContain("next");
					}
				});
			}
		});
	}
});
