// biome-ignore lint/style/noRestrictedImports: the boot step runs before anything serves; it needs a process's command line synchronously
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { linkClaudeProjectsAfterHomeMove } from "./claude-project-links";
import { defaultAppHomeDir, resolveUserHomeDir } from "./paths";

const LEGACY_APP_HOME_DIR_NAME = ".superset";
const MOVE_RECORD_FILE = "legacy-home-move.json";
const STOP_TIMEOUT_MS = 5_000;

export type LegacyHomeMove = "moved" | "nothing-to-move" | "failed";

export interface LegacyHomeMoveRecord {
	from: string;
	to: string;
}

/**
 * Boot-time step for a process that owns the app home (desktop main,
 * host-service), run before anything else touches it. When this process uses
 * the default home and `~/.superset` is still a real directory, stops the
 * host-services running from it, renames it to `~/.paradev` and leaves a
 * `~/.superset` symlink for older builds and paths we cannot rewrite. Files
 * pdev already keeps in `~/.paradev` are carried along, and Claude Code's
 * session folders are linked under the worktrees' new paths. On failure this run
 * keeps using `~/.superset`, and the next boot tries again. Never runs under
 * a test runner, where it would move the developer's real home.
 */
export function moveLegacyAppHome(env: NodeJS.ProcessEnv = process.env): {
	homeDir: string;
	move: LegacyHomeMove | "custom-home" | "test-runner";
} {
	if (env.NODE_ENV === "test" || env.NODE_TEST_CONTEXT !== undefined) {
		return {
			homeDir: env.SUPERSET_HOME_DIR?.trim() || defaultAppHomeDir(),
			move: "test-runner",
		};
	}
	const homeDir = defaultAppHomeDir();
	const legacyHomeDir = path.join(
		resolveUserHomeDir(),
		LEGACY_APP_HOME_DIR_NAME,
	);
	const explicit = env.SUPERSET_HOME_DIR?.trim();
	if (explicit && ![homeDir, legacyHomeDir].includes(path.resolve(explicit))) {
		return { homeDir: explicit, move: "custom-home" };
	}
	const move = moveHome(legacyHomeDir, homeDir);
	const inUse = move === "failed" ? legacyHomeDir : homeDir;
	env.SUPERSET_HOME_DIR = inUse;
	return { homeDir: inUse, move };
}

function moveHome(legacy: string, home: string): LegacyHomeMove {
	if (!isRealDirectory(legacy)) return "nothing-to-move";

	let carried: string[] = [];
	if (fs.existsSync(home)) {
		if (!isRealDirectory(home)) return "failed";
		carried = fs.readdirSync(home);
		if (carried.some((entry) => fs.existsSync(path.join(legacy, entry)))) {
			return "failed";
		}
	}
	stopHostServices(legacy);
	try {
		for (const entry of carried) {
			fs.renameSync(path.join(home, entry), path.join(legacy, entry));
		}
		if (fs.existsSync(home)) fs.rmdirSync(home);
		fs.renameSync(legacy, home);
	} catch {
		if (!isRealDirectory(legacy) && isRealDirectory(home)) {
			return "nothing-to-move";
		}
		putBack(legacy, home, carried);
		return "failed";
	}
	try {
		fs.symlinkSync(path.basename(home), legacy, "dir");
	} catch {
		// Something recreated ~/.superset in the gap: keep the move, since the
		// data is already in its new home.
		if (!fs.existsSync(legacy)) {
			try {
				fs.renameSync(home, legacy);
			} catch {}
			putBack(legacy, home, carried);
			return "failed";
		}
	}
	const record: LegacyHomeMoveRecord = { from: legacy, to: home };
	try {
		fs.writeFileSync(path.join(home, MOVE_RECORD_FILE), JSON.stringify(record));
	} catch {}
	linkClaudeProjectsAfterHomeMove({ legacyHomeDir: legacy, homeDir: home });
	return "moved";
}

function putBack(legacy: string, home: string, carried: string[]) {
	if (!isRealDirectory(legacy)) return;
	try {
		fs.mkdirSync(home, { recursive: true });
		for (const entry of carried) {
			const from = path.join(legacy, entry);
			if (fs.existsSync(from)) fs.renameSync(from, path.join(home, entry));
		}
	} catch {}
}

/**
 * A host-service caches worktree paths, watches them and writes host.db, so
 * none may run from the old directory while it moves. Terminals live in the
 * pty daemon, which keeps running and is adopted by the next host-service.
 */
function stopHostServices(legacy: string) {
	const pids = readManifestPids(path.join(legacy, "host")).filter(
		(pid) => pid !== process.pid && isAlive(pid) && isHostService(pid),
	);
	for (const pid of pids) signal(pid, "SIGTERM");
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (pids.some(isAlive) && Date.now() < deadline) sleep(50);
	for (const pid of pids.filter(isAlive)) signal(pid, "SIGKILL");
}

function readManifestPids(hostDir: string): number[] {
	let orgs: string[];
	try {
		orgs = fs.readdirSync(hostDir);
	} catch {
		return [];
	}
	return orgs.flatMap((org) => {
		try {
			const { pid } = JSON.parse(
				fs.readFileSync(path.join(hostDir, org, "manifest.json"), "utf8"),
			) as { pid?: unknown };
			return typeof pid === "number" && pid > 0 ? [pid] : [];
		} catch {
			return [];
		}
	});
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** A manifest outlives a crash or reboot, and its pid may now be another program. */
function isHostService(pid: number): boolean {
	try {
		return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
			encoding: "utf8",
		}).includes("host-service");
	} catch {
		return false;
	}
}

function signal(pid: number, name: NodeJS.Signals) {
	try {
		process.kill(pid, name);
	} catch {}
}

function sleep(ms: number) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRealDirectory(dir: string): boolean {
	try {
		return fs.lstatSync(dir).isDirectory();
	} catch {
		return false;
	}
}

export function readLegacyHomeMove(
	homeDir: string,
): LegacyHomeMoveRecord | null {
	try {
		const record = JSON.parse(
			fs.readFileSync(path.join(homeDir, MOVE_RECORD_FILE), "utf8"),
		) as Partial<LegacyHomeMoveRecord>;
		return typeof record.from === "string" && typeof record.to === "string"
			? { from: record.from, to: record.to }
			: null;
	} catch {
		return null;
	}
}

export interface SqliteRunner {
	prepare(sql: string): {
		run(...params: unknown[]): { changes: number | bigint };
	};
}

/**
 * Rewrites stored absolute paths under the old home to the new one. Safe to
 * run on every open: rows already rewritten no longer match.
 */
export function rewriteLegacyHomePaths(
	db: SqliteRunner,
	columns: ReadonlyArray<readonly [table: string, column: string]>,
	move: LegacyHomeMoveRecord,
): number {
	const prefix = `${move.from}/`;
	let changes = 0;
	for (const [table, column] of columns) {
		const result = db
			.prepare(
				`UPDATE "${table}" SET "${column}" = ? || substr("${column}", ?) WHERE "${column}" = ? OR substr("${column}", 1, ?) = ?`,
			)
			.run(move.to, move.from.length + 1, move.from, prefix.length, prefix);
		changes += Number(result.changes);
	}
	return changes;
}

/**
 * Points each repository's worktree records at the moved checkouts, so
 * `git worktree list` agrees with the rewritten paths. Failures are logged:
 * git still reaches the old paths through the `~/.superset` symlink.
 */
export async function repairGitWorktrees(
	worktrees: ReadonlyArray<{ repoPath: string; worktreePath: string }>,
): Promise<void> {
	const byRepo = new Map<string, string[]>();
	for (const { repoPath, worktreePath } of worktrees) {
		byRepo.set(repoPath, [...(byRepo.get(repoPath) ?? []), worktreePath]);
	}
	for (const [repoPath, paths] of byRepo) {
		await new Promise<void>((resolve) => {
			execFile(
				"git",
				["-C", repoPath, "worktree", "repair", ...paths],
				(error) => {
					if (error) {
						console.warn(
							`[legacy-home-move] git worktree repair failed in ${repoPath}:`,
							error.message,
						);
					}
					resolve();
				},
			);
		});
	}
}
