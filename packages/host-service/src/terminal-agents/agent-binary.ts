import { execFile } from "node:child_process";
import { open, readlink, realpath, stat } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Superset's own agent wrapper carries this line; the real binary is a later PATH match. */
const WRAPPER_MARKER_PREFIX = "# Superset agent-wrapper";

/**
 * The wrapper exports `SUPERSET_AGENT_LAUNCH_ID="$$-<epoch>"` and then execs
 * the agent, so the pid is the agent's own.
 */
export function parseLaunchPid(launchId: string | undefined): number | null {
	const pid = Number(launchId?.split("-")[0]);
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function isAgentWrapper(path: string): Promise<boolean> {
	const file = await open(path, "r");
	try {
		const { buffer, bytesRead } = await file.read(Buffer.alloc(128), 0, 128, 0);
		return buffer
			.subarray(0, bytesRead)
			.toString("utf8")
			.includes(WRAPPER_MARKER_PREFIX);
	} finally {
		await file.close();
	}
}

/**
 * The binary a new launch of `command` runs: past Superset's wrapper, with
 * symlinks resolved, so a version-named install path shows the version.
 */
export async function findInstalledBinary(
	command: string,
	pathEnv: string,
): Promise<string | null> {
	const candidates = command.includes("/")
		? [command]
		: pathEnv
				.split(delimiter)
				.filter(Boolean)
				.map((dir) => join(dir, command));
	for (const candidate of candidates) {
		try {
			const stats = await stat(candidate);
			if (!stats.isFile() || (stats.mode & 0o111) === 0) continue;
			if (await isAgentWrapper(candidate)) continue;
			return await realpath(candidate);
		} catch {}
	}
	return null;
}

export async function readRunningExecutable(
	pid: number,
): Promise<string | null> {
	try {
		if (process.platform === "linux") {
			return (await readlink(`/proc/${pid}/exe`)).replace(/ \(deleted\)$/, "");
		}
		if (process.platform !== "darwin") return null;
		const { stdout } = await execFileAsync(
			"/usr/sbin/lsof",
			["-a", "-p", String(pid), "-d", "txt", "-Fn"],
			{ timeout: 5_000 },
		);
		const nameLine = stdout.split("\n").find((line) => line.startsWith("n"));
		return nameLine ? nameLine.slice(1) : null;
	} catch {
		return null;
	}
}

/**
 * Whether a process runs an older copy of the installed binary. A different
 * file name means the pid now belongs to another program, or the agent runs
 * under an interpreter (an npm install runs `node`), so it cannot be compared.
 */
export function isOutdatedExecutable(
	running: string | null,
	installed: string | null,
): boolean {
	if (!running || !installed) return false;
	return basename(running) === basename(installed) && running !== installed;
}
