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

describe("buildDefaultAccountResolver credential commands", () => {
	it("refuses codex login and logout on the selected home without a terminal", () => {
		const { profile, env } = codexTerminal();
		for (const command of ["login", "logout"]) {
			const result = run(codexScript(), ["codex", command], env);
			expect(result.status).toBe(2);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(`codex ${command}`);
			expect(result.stderr).toContain(profile);
		}
	});

	it("runs the override the refusal suggests", () => {
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

	it("lets codex login status and help read the selected home", () => {
		const { profile, env } = codexTerminal();
		for (const args of [
			["login", "status"],
			["login", "--help"],
		]) {
			const result = run(codexScript(), ["codex", ...args], env);
			expect(result.status).toBe(0);
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
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const env = {
			SUPERSET_TERMINAL_ID: "t1",
			SUPERSET_HOME_DIR: home,
			CLAUDE_CONFIG_DIR: profile,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
		};
		const login = run(claudeScript(), ["claude", "auth", "login"], env);
		expect(login.status).toBe(2);
		expect(login.stdout).toBe("");
		expect(login.stderr).toContain(profile);
		const status = run(claudeScript(), ["claude", "auth", "status"], env);
		expect(status.status).toBe(0);
		expect(status.stdout).toBe(`ran with ${profile}`);
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
		const no = await runOnTerminal(codexScript(), ["codex", "login"], env, "n");
		expect(no.output).toContain("[y/N]");
		expect(no.output).not.toContain("ran with");
		expect(no.status).toBe(1);
	});
});
