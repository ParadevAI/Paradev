import { execFile } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { promisify } from "node:util";
import { getBinDir } from "@superset/agent-setup";
import { coerce, gte } from "semver";
import { UNGATED_VERSION } from "./acpCatalogue";
import { type AgentCliBinary, resolveAgentCliUpdate } from "./agentCliUpdate";

const execFileAsync = promisify(execFile);

const VERSION_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

export type AgentCli = {
	command: string;
	env: NodeJS.ProcessEnv;
};

function isExecutableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

const WIN32_DIRECT_EXEC_EXTENSIONS = [".exe", ".com"];

function candidateNames(binary: string): string[] {
	if (process.platform !== "win32") return [binary];
	return WIN32_DIRECT_EXEC_EXTENSIONS.map((ext) => binary + ext);
}

function findOnPath(binary: string, env: NodeJS.ProcessEnv): string | null {
	for (const dir of (env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		for (const name of candidateNames(binary)) {
			if (isExecutableFile(join(dir, name))) return join(dir, name);
		}
	}
	return null;
}

function supersetWrapper(binary: string): string | null {
	if (process.platform === "win32") return null;
	const wrapper = join(getBinDir(), binary);
	return isExecutableFile(wrapper) ? wrapper : null;
}

export function agentCliCommand(
	binary: string,
	env: NodeJS.ProcessEnv,
): string {
	return supersetWrapper(binary) ?? findOnPath(binary, env) ?? binary;
}

const SUPERSET_BIN_DIR = /^\.superset(?:-[^/]+)?\/bin$/;

/** The binary a Superset wrapper runs: the first on PATH outside Superset's bin dirs. */
export function realAgentCli(
	binary: string,
	env: NodeJS.ProcessEnv,
): AgentCliBinary | null {
	const home = env.HOME || homedir();
	for (const entry of (env.PATH ?? "").split(delimiter)) {
		const dir = entry.replace(/\/+$/, "");
		if (!dir || dir === getBinDir()) continue;
		if (SUPERSET_BIN_DIR.test(relative(home, dir))) continue;
		for (const name of candidateNames(binary)) {
			const path = join(dir, name);
			if (!isExecutableFile(path)) continue;
			try {
				return { path, realPath: realpathSync(path) };
			} catch {
				return { path, realPath: path };
			}
		}
	}
	return null;
}

function fingerprint(found: AgentCliBinary | null): string {
	if (!found) return "";
	try {
		// Not mtime: package managers keep the tarball's, so a reinstall leaves it as it was.
		const { ino, ctimeMs } = statSync(found.realPath);
		return `${found.realPath}:${ino}:${ctimeMs}`;
	} catch {
		return found.realPath;
	}
}

const cache = new Map<
	string,
	{ at: number; fingerprint: string; version: string | null }
>();

function parseVersion(output: string): string | null {
	return output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

async function probeVersion(
	command: string,
	env: NodeJS.ProcessEnv,
	binaryFingerprint: string,
): Promise<string | null> {
	const hit = cache.get(command);
	if (
		hit &&
		hit.fingerprint === binaryFingerprint &&
		Date.now() - hit.at < CACHE_TTL_MS
	) {
		return hit.version;
	}
	let version: string | null = null;
	try {
		const { stdout, stderr } = await execFileAsync(command, ["--version"], {
			env,
			timeout: VERSION_TIMEOUT_MS,
		});
		version = parseVersion(stdout) ?? parseVersion(stderr);
	} catch {
		version = null;
	}
	cache.set(command, {
		at: Date.now(),
		fingerprint: binaryFingerprint,
		version,
	});
	return version;
}

/** An update replaces the binary, which retires its cached version. */
export async function probeAgentCli(
	binary: string,
	env: NodeJS.ProcessEnv,
): Promise<{
	command: string;
	version: string | null;
	found: AgentCliBinary | null;
}> {
	const command = agentCliCommand(binary, env);
	const found = realAgentCli(binary, env);
	const version = await probeVersion(command, env, fingerprint(found));
	return { command, version, found };
}

export function clearAgentCliCache(): void {
	cache.clear();
}

export function agentCliUnsupported(options: {
	binary: string;
	minVersion: string;
	found: string | null;
	upgrade?: string;
}): string {
	const upgrade = options.upgrade ? ` Upgrade with: ${options.upgrade}` : "";
	const wanted =
		UNGATED_VERSION === options.minVersion
			? ""
			: ` ${options.minVersion} or newer`;
	if (!options.found) {
		return (
			`${options.binary} was not found, so this chat cannot start. Install` +
			` ${options.binary}${wanted} and make sure it is on your PATH.${upgrade}`
		);
	}
	return `${options.binary} ${options.minVersion} or newer is needed for chat, and ${options.found} is installed.${upgrade}`;
}

export function meetsFloor(found: string, minVersion: string): boolean {
	if (minVersion === UNGATED_VERSION) return true;
	const coerced = coerce(found);
	return !coerced || gte(coerced, minVersion);
}

export async function resolveAgentCli(options: {
	binary: string;
	minVersion: string;
	upgrade?: string;
	env: () => Promise<NodeJS.ProcessEnv>;
}): Promise<AgentCli> {
	const env = await options.env();
	const probed = await probeAgentCli(options.binary, env);
	const found = probed.version;
	if (!found || !meetsFloor(found, options.minVersion)) {
		const update = resolveAgentCliUpdate({
			binary: options.binary,
			found: probed.found,
			runMode: process.env.SUPERSET_HOST_RUN_MODE,
		});
		const upgrade = update ? (update.command ?? undefined) : options.upgrade;
		throw new Error(agentCliUnsupported({ ...options, found, upgrade }));
	}
	return { command: probed.command, env };
}
