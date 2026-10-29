import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claudeProjectDirName } from "./claude-project-links";
import {
	moveLegacyAppHome,
	readLegacyHomeMove,
	repairGitWorktrees,
	rewriteLegacyHomePaths,
} from "./legacy-home-move";
import { isDefaultAppHomeDir } from "./paths";

let home: string;
const originalHome = process.env.HOME;

beforeEach(() => {
	home = realpathSync(mkdtempSync(path.join(tmpdir(), "legacy-home-")));
	process.env.HOME = home;
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
	process.env.HOME = originalHome;
});

const paradev = () => path.join(home, ".paradev");
const superset = () => path.join(home, ".superset");

function write(file: string, content: string) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content);
}

describe("moveLegacyAppHome", () => {
	it("uses ~/.paradev on a fresh machine", () => {
		const env: NodeJS.ProcessEnv = {};

		expect(moveLegacyAppHome(env)).toEqual({
			homeDir: paradev(),
			move: "nothing-to-move",
		});
		expect(env.SUPERSET_HOME_DIR).toBe(paradev());
	});

	it("moves ~/.superset, leaves a symlink and records the move", () => {
		write(path.join(superset(), "local.db"), "data");
		const env: NodeJS.ProcessEnv = { SUPERSET_HOME_DIR: superset() };

		expect(moveLegacyAppHome(env).move).toBe("moved");
		expect(env.SUPERSET_HOME_DIR).toBe(paradev());
		expect(readFileSync(path.join(paradev(), "local.db"), "utf8")).toBe("data");
		expect(readlinkSync(superset())).toBe(".paradev");
		expect(readLegacyHomeMove(paradev())).toEqual({
			from: superset(),
			to: paradev(),
		});
		expect(moveLegacyAppHome({}).move).toBe("nothing-to-move");
	});

	it("carries pdev's files already in ~/.paradev", () => {
		write(path.join(superset(), "local.db"), "data");
		write(path.join(paradev(), "agent", "auth.json"), "{}");

		expect(moveLegacyAppHome({}).move).toBe("moved");
		expect(
			readFileSync(path.join(paradev(), "agent", "auth.json"), "utf8"),
		).toBe("{}");
		expect(existsSync(path.join(paradev(), "local.db"))).toBe(true);
	});

	it("keeps ~/.superset for this run when a name exists in both", () => {
		write(path.join(superset(), "agent", "x"), "app");
		write(path.join(paradev(), "agent", "x"), "pdev");
		const env: NodeJS.ProcessEnv = {};

		expect(moveLegacyAppHome(env)).toEqual({
			homeDir: superset(),
			move: "failed",
		});
		expect(env.SUPERSET_HOME_DIR).toBe(superset());
		expect(readFileSync(path.join(paradev(), "agent", "x"), "utf8")).toBe(
			"pdev",
		);
		expect(lstatSync(superset()).isDirectory()).toBe(true);
	});

	it("stops a host-service running from ~/.superset first", async () => {
		const child = Bun.spawn(["bash", "-c", "exec -a host-service sleep 30"]);
		await Bun.sleep(100);
		write(
			path.join(superset(), "host", "org-1", "manifest.json"),
			JSON.stringify({ pid: child.pid }),
		);

		expect(moveLegacyAppHome({}).move).toBe("moved");
		expect(await child.exited).not.toBe(0);
	});

	it("leaves the host-service running when a name clash blocks the move", async () => {
		const host = Bun.spawn(["bash", "-c", "exec -a host-service sleep 30"]);
		await Bun.sleep(100);
		write(
			path.join(superset(), "host", "org-1", "manifest.json"),
			JSON.stringify({ pid: host.pid }),
		);
		write(path.join(superset(), "agent", "x"), "app");
		write(path.join(paradev(), "agent", "x"), "pdev");

		expect(moveLegacyAppHome({}).move).toBe("failed");
		await Bun.sleep(200);
		expect(() => process.kill(host.pid, 0)).not.toThrow();
		host.kill();
	});

	it("leaves a process alone when a stale manifest's pid was reused", async () => {
		const unrelated = Bun.spawn(["sleep", "30"]);
		write(
			path.join(superset(), "host", "org-1", "manifest.json"),
			JSON.stringify({ pid: unrelated.pid }),
		);

		expect(moveLegacyAppHome({}).move).toBe("moved");
		await Bun.sleep(200);
		expect(() => process.kill(unrelated.pid, 0)).not.toThrow();
		unrelated.kill();
	});

	it("links Claude account folders kept in hidden dirs under home", () => {
		write(path.join(superset(), "local.db"), "data");
		const oldName = claudeProjectDirName(
			path.join(superset(), "worktrees", "app", "main"),
		);
		mkdirSync(path.join(home, ".claude-work", "projects", oldName), {
			recursive: true,
		});

		expect(moveLegacyAppHome({}).move).toBe("moved");
		const newName = claudeProjectDirName(
			path.join(paradev(), "worktrees", "app", "main"),
		);
		expect(
			readlinkSync(path.join(home, ".claude-work", "projects", newName)),
		).toBe(oldName);
	});

	it("leaves a custom home alone", () => {
		write(path.join(superset(), "local.db"), "data");
		const custom = path.join(home, "dev-data");

		expect(moveLegacyAppHome({ SUPERSET_HOME_DIR: custom })).toEqual({
			homeDir: custom,
			move: "custom-home",
		});
		expect(lstatSync(superset()).isDirectory()).toBe(true);
	});

	it("never runs under a test runner", () => {
		write(path.join(superset(), "local.db"), "data");

		expect(moveLegacyAppHome({ NODE_ENV: "test" }).move).toBe("test-runner");
		expect(lstatSync(superset()).isDirectory()).toBe(true);
	});
});

describe("rewriteLegacyHomePaths", () => {
	it("rewrites paths under the old home and nothing else", () => {
		const db = new Database(":memory:");
		db.run("CREATE TABLE workspaces (worktree_path TEXT)");
		for (const value of [
			"/u/.superset/worktrees/app/main",
			"/u/.superset",
			"/u/.superset-dev/worktrees/x",
			"/u/code/app",
			null,
		]) {
			db.prepare("INSERT INTO workspaces VALUES (?)").run(value);
		}
		const move = { from: "/u/.superset", to: "/u/.paradev" };

		expect(
			rewriteLegacyHomePaths(db, [["workspaces", "worktree_path"]], move),
		).toBe(2);
		expect(
			db
				.query("SELECT worktree_path AS p FROM workspaces")
				.all()
				.map((row) => (row as { p: string | null }).p),
		).toEqual([
			"/u/.paradev/worktrees/app/main",
			"/u/.paradev",
			"/u/.superset-dev/worktrees/x",
			"/u/code/app",
			null,
		]);
		expect(
			rewriteLegacyHomePaths(db, [["workspaces", "worktree_path"]], move),
		).toBe(0);
	});
});

describe("repairGitWorktrees", () => {
	it("points git at a moved worktree", async () => {
		const repo = path.join(home, "repo");
		const git = (...args: string[]) =>
			execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
		mkdirSync(repo);
		git("init", "-q");
		git(
			"-c",
			"user.email=t@t",
			"-c",
			"user.name=t",
			"commit",
			"-q",
			"--allow-empty",
			"-m",
			"x",
		);
		const before = path.join(home, "old", "wt");
		const after = path.join(home, "new", "wt");
		git("worktree", "add", "-q", before);
		mkdirSync(path.dirname(after));
		renameSync(before, after);

		await repairGitWorktrees([{ repoPath: repo, worktreePath: after }]);

		expect(git("worktree", "list", "--porcelain")).toContain(
			`worktree ${after}`,
		);
	});
});

describe("isDefaultAppHomeDir", () => {
	it("counts the pre-rename home and its link as the default", () => {
		mkdirSync(paradev());
		symlinkSync(".paradev", superset());

		expect(isDefaultAppHomeDir(superset())).toBe(true);
		expect(isDefaultAppHomeDir(paradev())).toBe(true);
		expect(isDefaultAppHomeDir(path.join(home, "elsewhere"))).toBe(false);
	});
});
