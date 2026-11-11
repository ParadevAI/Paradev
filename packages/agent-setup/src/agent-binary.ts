import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
import {
	isManagedCodingAgent,
	managedAgentBinaryPath,
} from "./managed-agent-binaries";
import { getBinDir, resolveUserHomeDir } from "./paths";

/** Home dirs whose `bin` holds Paradev's wrappers: this build's, and renamed or dev builds'. */
const WRAPPER_HOME_DIRS = [
	".paradev",
	".paradev-*",
	".superset",
	".superset-*",
];

/** The wrapper dirs as a POSIX `case` pattern, for the wrapper script's own lookup. */
export function wrapperBinDirCasePattern(): string {
	return [
		`"${getBinDir()}"`,
		...WRAPPER_HOME_DIRS.map((dir) => `"$HOME"/${dir}/bin`),
	].join("|");
}

const WRAPPER_HOME_DIR_PATTERNS = WRAPPER_HOME_DIRS.map(
	(glob) =>
		new RegExp(`^${glob.replaceAll(".", "\\.").replaceAll("*", ".*")}$`),
);

/** A PATH dir that holds Paradev's wrappers, never a real agent. */
export function isWrapperBinDir(
	dir: string,
	homeDir: string = resolveUserHomeDir(),
): boolean {
	const resolved = path.resolve(dir);
	if (resolved === path.resolve(getBinDir())) return true;
	if (path.basename(resolved) !== "bin") return false;
	const parent = path.dirname(resolved);
	return (
		path.dirname(parent) === path.resolve(homeDir) &&
		WRAPPER_HOME_DIR_PATTERNS.some((pattern) =>
			pattern.test(path.basename(parent)),
		)
	);
}

export function isExecutableFile(filePath: string): boolean {
	try {
		if (!statSync(filePath).isFile()) return false;
		accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Windows runs `claude.exe` from the native installer; it can't exec a bare name. */
function binaryNames(binary: string, platform: NodeJS.Platform): string[] {
	return platform === "win32" ? [`${binary}.exe`, `${binary}.com`] : [binary];
}

export interface ResolveAgentBinaryOptions {
	platform?: NodeJS.Platform;
	homeDir?: string;
	isExecutable?: (filePath: string) => boolean;
}

export interface AgentBinary {
	path: string;
	/** `path`: the user's own install. `paradev`: the copy the app installed. */
	source: "path" | "paradev";
}

/**
 * The real agent binary for `binary`: the user's own on PATH first, wrapper
 * dirs skipped, then the copy the app installed. The desktop, host-service
 * and the wrapper scripts all resolve agents this way.
 */
export function resolveAgentBinary(
	binary: string,
	pathValue: string,
	options: ResolveAgentBinaryOptions = {},
): AgentBinary | null {
	const platform = options.platform ?? process.platform;
	const isExecutable = options.isExecutable ?? isExecutableFile;
	const delimiter = platform === "win32" ? ";" : ":";
	for (const dir of pathValue.split(delimiter)) {
		if (!dir || isWrapperBinDir(dir, options.homeDir)) continue;
		for (const name of binaryNames(binary, platform)) {
			const candidate = path.join(dir, name);
			if (isExecutable(candidate)) return { path: candidate, source: "path" };
		}
	}
	if (!isManagedCodingAgent(binary)) return null;
	const managed = managedAgentBinaryPath(binary);
	return isExecutable(managed) ? { path: managed, source: "paradev" } : null;
}

export function parseAgentVersion(output: string): string | null {
	return output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

/** Major.minor.patch comparison; a version it can't read passes, as before. */
export function meetsMinVersion(found: string, minimum: string): boolean {
	const parts = (version: string) =>
		version
			.match(/(\d+)\.(\d+)\.(\d+)/)
			?.slice(1, 4)
			.map(Number) ?? null;
	const have = parts(found);
	const want = parts(minimum);
	if (!have || !want) return true;
	for (let i = 0; i < 3; i++) {
		if ((have[i] ?? 0) !== (want[i] ?? 0)) {
			return (have[i] ?? 0) > (want[i] ?? 0);
		}
	}
	return true;
}
