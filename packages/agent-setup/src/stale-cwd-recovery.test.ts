import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWrapperScript } from "./agent-wrappers-common";
import {
	createBashWrapper,
	createZshWrapper,
	type ShellWrapperPaths,
} from "./shell-wrappers";

/**
 * Unmounting a volume and mounting it again leaves a new directory at the old
 * path. Deleting and recreating the directory under a running shell is the
 * same thing as far as the shell's working directory is concerned.
 */
describe("stale working directory recovery", () => {
	let root: string;
	let worktree: string;
	let realBinDir: string;
	let paths: ShellWrapperPaths;

	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), "superset-stale-")));
		worktree = path.join(root, "volume", "worktree");
		realBinDir = path.join(root, "real-bin");
		paths = {
			BIN_DIR: path.join(root, "bin"),
			ZSH_DIR: path.join(root, "zsh"),
			BASH_DIR: path.join(root, "bash"),
		};
		for (const dir of [worktree, realBinDir, ...Object.values(paths)]) {
			mkdirSync(dir, { recursive: true });
		}
		// Stands in for the agent: fails like one when the directory is stale.
		writeFileSync(
			path.join(realBinDir, "claude"),
			"#!/bin/sh\nexec /bin/pwd\n",
			{ mode: 0o755 },
		);
		writeFileSync(
			path.join(paths.BIN_DIR, "claude"),
			buildWrapperScript("claude", 'exec "$REAL_BIN" "$@"'),
			{ mode: 0o755 },
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function run(shell: string, script: string, remountBack = true) {
		const volume = path.join(root, "volume");
		const drop = `rm -rf "${volume}"${remountBack ? '; mkdir -p "$PWD"' : ""}`;
		return spawnSync(shell, ["-c", `cd "${worktree}"\n${drop}\n${script}`], {
			encoding: "utf-8",
			env: {
				HOME: root,
				PATH: `${paths.BIN_DIR}:${realBinDir}:/usr/bin:/bin`,
			},
		});
	}

	it("the stand-in agent fails in a stale directory without recovery", () => {
		const result = run("bash", `"${realBinDir}/claude"`);
		expect(result.status).not.toBe(0);
	});

	it("agent wrapper re-enters the directory before launching the agent", () => {
		const result = run("bash", `"${paths.BIN_DIR}/claude"`);
		expect(result.stdout.trim()).toBe(worktree);
		expect(result.status).toBe(0);
	});

	it("agent wrapper leaves a directory that is really gone alone", () => {
		const result = run("bash", `"${paths.BIN_DIR}/claude"`, false);
		expect(result.status).not.toBe(0);
	});

	it("zsh hook repairs the shell before the next command and prompt", () => {
		createZshWrapper(paths);
		const zshrc = readFileSync(path.join(paths.ZSH_DIR, ".zshrc"), "utf-8");
		const hook = zshrc.slice(
			zshrc.indexOf("typeset -ga preexec_functions"),
			zshrc.indexOf("rehash"),
		);
		expect(hook).toContain("_superset_fix_stale_cwd()");

		const result = spawnSync(
			"zsh",
			[
				"-fc",
				`${hook}
print -r -- "hooks:\${preexec_functions[(Ie)_superset_fix_stale_cwd]}:\${precmd_functions[(Ie)_superset_fix_stale_cwd]}"
cd "${worktree}"
rm -rf "${path.join(root, "volume")}"; mkdir -p "$PWD"
_superset_fix_stale_cwd
/bin/pwd`,
			],
			{ encoding: "utf-8", env: { HOME: root, PATH: "/usr/bin:/bin" } },
		);
		const lines = result.stdout.trim().split("\n");
		expect(lines[0]).not.toContain(":0");
		expect(lines[1]).toBe(worktree);
		expect(result.status).toBe(0);
	});

	it("bash prompt hook repairs the shell", () => {
		createBashWrapper(paths);
		const rcfile = readFileSync(path.join(paths.BASH_DIR, "rcfile"), "utf-8");
		expect(rcfile).toContain(
			'PROMPT_COMMAND="__superset_fix_stale_cwd;__superset_prompt_mark"',
		);
		const start = rcfile.indexOf("__superset_fix_stale_cwd() {");
		const fn = rcfile.slice(start, rcfile.indexOf("\n}", start) + 2);

		const result = run("bash", `${fn}\n__superset_fix_stale_cwd\n/bin/pwd`);
		expect(result.stdout.trim()).toBe(worktree);
		expect(result.status).toBe(0);
	});
});
