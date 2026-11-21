import { describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDefaultAccountResolver } from "./agent-wrappers-common";

/** Runs the resolver block under bash and returns the resulting env var. */
function resolve(env: Record<string, string | undefined>): string {
	const script = `${buildDefaultAccountResolver(
		"CLAUDE_CONFIG_DIR",
		"default-claude-config-dir",
	)}printf "%s" "\${CLAUDE_CONFIG_DIR:-<unset>}"`;
	const cleanEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) cleanEnv[key] = value;
	}
	return execFileSync("bash", ["-c", script], {
		env: cleanEnv,
		encoding: "utf-8",
	});
}

function resolveWithTwin(env: Record<string, string | undefined>): string {
	const script = `${buildDefaultAccountResolver(
		"CLAUDE_CONFIG_DIR",
		"default-claude-config-dir",
	)}printf "%s|%s" "\${CLAUDE_CONFIG_DIR:-<unset>}" "\${SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR:-<unset>}"`;
	const cleanEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) cleanEnv[key] = value;
	}
	return execFileSync("bash", ["-c", script], {
		env: cleanEnv,
		encoding: "utf-8",
	});
}

function resolveCodexWithTwin(env: Record<string, string | undefined>): string {
	const script = `${buildDefaultAccountResolver(
		"CODEX_HOME",
		"default-codex-home",
		{ ambientEnvVar: "SUPERSET_AMBIENT_CODEX_HOME" },
	)}printf "%s|%s" "\${CODEX_HOME:-<unset>}" "\${SUPERSET_DEFAULT_CODEX_HOME:-<unset>}"`;
	const cleanEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) cleanEnv[key] = value;
	}
	return execFileSync("bash", ["-c", script], {
		env: cleanEnv,
		encoding: "utf-8",
	});
}

function makeHome(pointer: string | null): {
	home: string;
	profile: string;
} {
	const home = mkdtempSync(join(tmpdir(), "superset-resolver-"));
	const profile = join(home, "profile");
	mkdirSync(join(home, "state"), { recursive: true });
	mkdirSync(profile);
	if (pointer !== null) {
		writeFileSync(join(home, "state", "default-claude-config-dir"), pointer);
	}
	return { home, profile };
}

describe("buildDefaultAccountResolver", () => {
	it("adopts the pointer in a Paradev terminal with no spawn-time value", () => {
		const { home, profile } = makeHome("");
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolve({ SUPERSET_TERMINAL_ID: "t1", SUPERSET_HOME_DIR: home }),
		).toBe(profile);
	});

	it("re-resolves over a stale Paradev-injected value", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
			}),
		).toBe(profile);
	});

	it("updates the injection marker when it adopts a new pointer", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolveWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
			}),
		).toBe(`${profile}|${profile}`);
	});

	it("clears a stale injected value when the pointer says system default", () => {
		const { home, profile } = makeHome("");
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: profile,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe("<unset>");
	});

	it("clears the injection marker with the injected value", () => {
		const { home, profile } = makeHome("");
		expect(
			resolveWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: profile,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe("<unset>|<unset>");
	});

	it("restores the ambient Codex home when switching to system default", () => {
		const { home, profile } = makeHome(null);
		const ambient = join(home, "custom-codex");
		writeFileSync(join(home, "state", "default-codex-home"), "");
		expect(
			resolveCodexWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CODEX_HOME: profile,
				SUPERSET_DEFAULT_CODEX_HOME: profile,
				SUPERSET_AMBIENT_CODEX_HOME: ambient,
			}),
		).toBe(`${ambient}|${ambient}`);
	});

	it("adopts a later Codex profile over an injected ambient default", () => {
		const { home, profile } = makeHome(null);
		const ambient = join(home, "custom-codex");
		writeFileSync(join(home, "state", "default-codex-home"), profile);
		expect(
			resolveCodexWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CODEX_HOME: ambient,
				SUPERSET_DEFAULT_CODEX_HOME: ambient,
				SUPERSET_AMBIENT_CODEX_HOME: ambient,
			}),
		).toBe(`${profile}|${profile}`);
	});

	it("never overrides a value the user exported by hand", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/user-picked-this",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe("/tmp/user-picked-this");
	});

	it("does nothing outside Paradev terminals", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(resolve({ SUPERSET_HOME_DIR: home })).toBe("<unset>");
	});

	it("does nothing when the pointer file is missing (older host build)", () => {
		const { home } = makeHome(null);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/spawn-time",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/tmp/spawn-time",
			}),
		).toBe("/tmp/spawn-time");
	});

	it("ignores a pointer at a vanished dir instead of booting signed out", () => {
		const { home } = makeHome("/tmp/deleted-profile-dir-that-is-gone");
		expect(
			resolve({ SUPERSET_TERMINAL_ID: "t1", SUPERSET_HOME_DIR: home }),
		).toBe("<unset>");
	});
});

function withPath(
	env: Record<string, string | undefined>,
): Record<string, string> {
	const cleanEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) cleanEnv[key] = value;
	}
	return cleanEnv;
}

function codexScript(): string {
	return `${buildDefaultAccountResolver("CODEX_HOME", "default-codex-home", {
		ambientEnvVar: "SUPERSET_AMBIENT_CODEX_HOME",
		credentialCommands: ["login", "logout"],
		readOnlyCommands: ["login status"],
	})}printf "ran with %s" "\${CODEX_HOME:-<unset>}"`;
}

function claudeScript(): string {
	return `${buildDefaultAccountResolver(
		"CLAUDE_CONFIG_DIR",
		"default-claude-config-dir",
		{ credentialCommands: ["auth login", "auth logout"] },
	)}printf "ran with %s" "\${CLAUDE_CONFIG_DIR:-<unset>}"`;
}

/** Runs `script` as the wrapper would, with stdin and stderr not a terminal. */
function run(
	script: string,
	argv: string[],
	env: Record<string, string | undefined>,
) {
	return spawnSync("bash", ["-c", script, ...argv], {
		env: withPath(env),
		encoding: "utf-8",
	});
}

/** Runs `script` on a pseudo-terminal and types `answer` at the prompt. */
async function runOnTerminal(
	script: string,
	argv: string[],
	env: Record<string, string | undefined>,
	answer: string,
): Promise<{ status: number; output: string }> {
	const decoder = new TextDecoder();
	let output = "";
	let answered = false;
	let onClose: (() => void) | undefined;
	const closed = new Promise<void>((resolve) => {
		onClose = resolve;
	});
	const proc = Bun.spawn(["bash", "-c", script, ...argv], {
		env: withPath(env),
		terminal: {
			data(terminal, chunk) {
				output += decoder.decode(chunk, { stream: true });
				if (!answered && output.includes("[y/N]")) {
					answered = true;
					terminal.write(`${answer}\n`);
				}
			},
			exit: () => onClose?.(),
		},
	});
	const status = await proc.exited;
	await closed;
	proc.terminal?.close();
	return { status, output };
}

/**
 * Runs `script` on a pseudo-terminal with `input` piped into its stdin, so
 * only stderr and /dev/tty are the terminal, and types `answer` at the prompt.
 */
function runPipedOnTerminal(
	script: string,
	argv: string[],
	env: Record<string, string | undefined>,
	input: string,
	answer: string,
): Promise<{ status: number; output: string }> {
	return runOnTerminal(
		`printf "%s" "$1" | bash -c "$0" "\${@:2}"`,
		[script, input, ...argv],
		env,
		answer,
	);
}

/** A workspace terminal spawned while `profile` was the selected Codex home. */
function codexTerminal() {
	const { home, profile } = makeHome(null);
	const ambient = join(home, "codex-default");
	writeFileSync(join(home, "state", "default-codex-home"), profile);
	return {
		home,
		profile,
		ambient,
		env: {
			SUPERSET_TERMINAL_ID: "t1",
			SUPERSET_HOME_DIR: home,
			CODEX_HOME: profile,
			SUPERSET_DEFAULT_CODEX_HOME: profile,
			SUPERSET_AMBIENT_CODEX_HOME: ambient,
		},
	};
}

/** A workspace terminal spawned while `profile` was the selected Claude dir. */
function claudeTerminal() {
	const { home, profile } = makeHome(null);
	writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
	return {
		home,
		profile,
		env: {
			SUPERSET_TERMINAL_ID: "t1",
			SUPERSET_HOME_DIR: home,
			CLAUDE_CONFIG_DIR: profile,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
		},
	};
}

describe("buildDefaultAccountResolver credential commands", () => {
	it("refuses codex login and logout on the selected home without a terminal", () => {
		const { profile, env } = codexTerminal();
		for (const command of ["login", "logout"]) {
			const result = run(codexScript(), ["codex", command], env);
			expect(result.status).toBe(2);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(`codex ${command}`);
			expect(result.stderr).toContain(profile);
			expect(result.stderr).toContain("confirm this in a terminal");
			// Nothing a caller could run to skip the question or sign in elsewhere.
			expect(result.stderr).not.toContain("CODEX_HOME=");
			expect(result.stderr).not.toContain("env -u");
		}
	});

	it("runs the override documented for scripts", () => {
		const { profile, env } = codexTerminal();
		const result = run(codexScript(), ["codex", "login"], {
			...env,
			SUPERSET_DEFAULT_CODEX_HOME: "",
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`ran with ${profile}`);
	});

	it("refuses an injected selection outside workspace terminals too", () => {
		const { env } = codexTerminal();
		const result = run(codexScript(), ["codex", "login"], {
			...env,
			SUPERSET_TERMINAL_ID: undefined,
		});
		expect(result.status).toBe(2);
		expect(result.stdout).toBe("");
	});

	it("refuses codex sign-ins with options before or after the subcommand", () => {
		const { profile, env } = codexTerminal();
		for (const args of [
			["-c", "model=x", "login"],
			["--config", "model=x", "logout"],
			["--enable", "hooks", "logout"],
			["-p", "work", "login"],
			["login", "--with-api-key"],
			// An option value that reads "status" is not `codex login status`.
			["login", "--experimental_issuer", "status"],
		]) {
			const result = run(codexScript(), ["codex", ...args], env);
			expect({ args, status: result.status }).toEqual({ args, status: 2 });
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(profile);
		}
	});

	it("keeps an unset CODEX_HOME unset when root options come first", () => {
		const { env } = codexTerminal();
		const result = run(codexScript(), ["codex", "-c", "model=x", "login"], {
			...env,
			CODEX_HOME: undefined,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("ran with <unset>");
	});

	it("lets codex login status and help read the selected home", () => {
		const { profile, env } = codexTerminal();
		for (const args of [
			["login", "status"],
			["-c", "model=x", "login", "status"],
			["login", "--help"],
			["-c", "model=x", "logout", "-h"],
			["help", "login"],
		]) {
			const result = run(codexScript(), ["codex", ...args], env);
			expect({ args, status: result.status }).toEqual({ args, status: 0 });
			expect(result.stdout).toBe(`ran with ${profile}`);
		}
	});

	it("matches command words only as whole arguments before --", () => {
		const { profile, env } = codexTerminal();
		for (const args of [
			["exec", "--", "login"],
			["exec", "please login"],
			["-c", "login=1"],
		]) {
			const result = run(codexScript(), ["codex", ...args], env);
			expect({ args, status: result.status }).toEqual({ args, status: 0 });
			expect(result.stdout).toBe(`ran with ${profile}`);
		}
	});

	it("keeps an unset CODEX_HOME unset for codex login", () => {
		const { env } = codexTerminal();
		const result = run(codexScript(), ["codex", "login"], {
			...env,
			CODEX_HOME: undefined,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("ran with <unset>");
	});

	it("runs codex login on a home the user named", () => {
		const { env } = codexTerminal();
		const result = run(codexScript(), ["codex", "login"], {
			...env,
			CODEX_HOME: "/tmp/user-picked-this",
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("ran with /tmp/user-picked-this");
	});

	it("runs codex login on the default home when no account is selected", () => {
		const { home, ambient, env } = codexTerminal();
		writeFileSync(join(home, "state", "default-codex-home"), "");
		const result = run(codexScript(), ["codex", "login"], {
			...env,
			CODEX_HOME: ambient,
			SUPERSET_DEFAULT_CODEX_HOME: ambient,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`ran with ${ambient}`);
	});

	it("still points agent runs at the selected home", () => {
		const { profile, env } = codexTerminal();
		for (const args of [[], ["exec", "log in to the app"]]) {
			const result = run(codexScript(), ["codex", ...args], {
				...env,
				CODEX_HOME: undefined,
			});
			expect(result.status).toBe(0);
			expect(result.stdout).toBe(`ran with ${profile}`);
		}
	});

	it("refuses claude auth login on the selected config dir, not auth status", () => {
		const { profile, env } = claudeTerminal();
		const login = run(claudeScript(), ["claude", "auth", "login"], env);
		expect(login.status).toBe(2);
		expect(login.stdout).toBe("");
		expect(login.stderr).toContain(profile);
		expect(login.stderr).not.toContain("CLAUDE_CONFIG_DIR=");
		expect(login.stderr).not.toContain("env -u");
		const status = run(claudeScript(), ["claude", "auth", "status"], env);
		expect(status.status).toBe(0);
		expect(status.stdout).toBe(`ran with ${profile}`);
	});

	it("refuses claude auth login and logout with options before them", () => {
		const { profile, env } = claudeTerminal();
		for (const args of [
			["--verbose", "auth", "login"],
			["-d", "auth", "logout"],
			["--settings", "/dev/null", "auth", "login", "--console"],
		]) {
			const result = run(claudeScript(), ["claude", ...args], env);
			expect({ args, status: result.status }).toEqual({ args, status: 2 });
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(profile);
		}
	});

	it("starts a claude chat whose one-argument prompt reads auth login", () => {
		const { profile, env } = claudeTerminal();
		for (const args of [["auth login"], ["-p", "auth login"]]) {
			const result = run(claudeScript(), ["claude", ...args], env);
			expect({ args, status: result.status }).toEqual({ args, status: 0 });
			expect(result.stdout).toBe(`ran with ${profile}`);
		}
	});

	it("asks on a terminal and continues only on yes", async () => {
		const { profile, env } = codexTerminal();
		const yes = await runOnTerminal(
			codexScript(),
			["codex", "login"],
			env,
			"y",
		);
		const [prompt, afterPrompt = ""] = yes.output.split("[y/N]");
		expect(prompt).toContain(profile);
		expect(afterPrompt).toContain(`ran with ${profile}`);
		expect(yes.status).toBe(0);
		for (const answer of ["n", ""]) {
			const no = await runOnTerminal(
				codexScript(),
				["codex", "login"],
				env,
				answer,
			);
			expect({ answer, status: no.status }).toEqual({ answer, status: 1 });
			expect(no.output).toContain("[y/N]");
			expect(no.output).not.toContain("ran with");
		}
	});

	it("points at the system default after a no", async () => {
		const { ambient, env } = codexTerminal();
		const codex = await runOnTerminal(
			codexScript(),
			["codex", "-c", "model=x", "login", "--device-auth"],
			env,
			"n",
		);
		expect(codex.output).toContain(
			`CODEX_HOME=${ambient} codex -c model=x login --device-auth`,
		);
		const claude = await runOnTerminal(
			claudeScript(),
			["claude", "auth", "login", "--console"],
			claudeTerminal().env,
			"n",
		);
		expect(claude.output).toContain(
			"env -u CLAUDE_CONFIG_DIR claude auth login --console",
		);
	});

	it("asks on the terminal when stdin carries input for the CLI", async () => {
		const { profile, env } = codexTerminal();
		const script = `${codexScript()}\nprintf " stdin=%s" "$(cat)"`;
		const argv = ["codex", "login", "--with-api-key"];
		const yes = await runPipedOnTerminal(script, argv, env, "sk-test", "y");
		const [prompt, afterPrompt = ""] = yes.output.split("[y/N]");
		expect(prompt).toContain(profile);
		expect(afterPrompt).toContain(`ran with ${profile} stdin=sk-test`);
		expect(yes.status).toBe(0);
		const no = await runPipedOnTerminal(script, argv, env, "sk-test", "n");
		expect(no.output).toContain("[y/N]");
		expect(no.output).not.toContain("ran with");
		expect(no.status).toBe(1);
	});

	it("leaves sign-ins alone when nothing is selected", () => {
		for (const [script, argv] of [
			[codexScript(), ["codex", "login"]],
			[claudeScript(), ["claude", "auth", "login"]],
		] as const) {
			const result = run(script, [...argv], {});
			expect({ argv, status: result.status }).toEqual({ argv, status: 0 });
			expect(result.stdout).toBe("ran with <unset>");
		}
	});
});
