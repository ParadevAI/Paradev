import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface DaemonRuntimeIdentity {
	execPath: string;
	scriptPath: string;
	bundleId?: string;
}

export function resolveCanonicalPath(targetPath: string): string {
	try {
		return fs.realpathSync(targetPath);
	} catch {
		return path.resolve(targetPath);
	}
}

/**
 * Snapshot the executable + entrypoint script backing a daemon or supervisor.
 *
 * Comparing `daemonVersion` alone misses desktop auto-updates (notably macOS
 * Squirrel/ShipIt replacements) where the app bundle changes on disk while
 * `pty-daemon/package.json#version` stays unchanged. Hashing the executable's
 * `(ino, size)` and the daemon script bytes catches both relocated bundles and
 * in-place replacements without relying on virtual ASAR mtimes.
 */
export function readDaemonRuntimeIdentity(
	scriptPath?: string,
	execPath: string = process.execPath,
): DaemonRuntimeIdentity | undefined {
	if (!scriptPath || !execPath) return undefined;

	const canonicalScriptPath = resolveCanonicalPath(scriptPath);
	if (!fs.existsSync(canonicalScriptPath)) return undefined;

	const canonicalExecPath = resolveCanonicalPath(execPath);
	const hash = createHash("sha256");
	hash.update(canonicalExecPath);
	hash.update("\0");
	try {
		const execStat = fs.statSync(canonicalExecPath);
		hash.update(`${execStat.ino}:${execStat.size}`);
	} catch {
		// Still hash the canonical script contents below if exec stat fails.
	}
	hash.update("\0");
	hash.update(canonicalScriptPath);
	hash.update("\0");

	try {
		hash.update(fs.readFileSync(canonicalScriptPath));
	} catch {
		return {
			execPath: canonicalExecPath,
			scriptPath: canonicalScriptPath,
		};
	}

	return {
		execPath: canonicalExecPath,
		scriptPath: canonicalScriptPath,
		bundleId: hash.digest("hex"),
	};
}
