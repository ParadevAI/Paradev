import { execFile } from "node:child_process";
import { open, readlink, realpath, stat } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Superset's own agent wrapper carries this line; the real binary is a later PATH match. */
const WRAPPER_MARKER_PREFIX = "# Superset agent-wrapper";

export interface ExecutableFile {
	path: string;
	/** `<device>:<inode>`: an update that rewrites the same path still changes it. */
	fileId: string;
}

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

/** The binary a new launch of `command` runs: past Superset's wrapper, with symlinks resolved. */
export async function findInstalledBinary(
	command: string,
	pathEnv: string,
): Promise<ExecutableFile | null> {
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
			return {
				path: await realpath(candidate),
				fileId: `${stats.dev}:${stats.ino}`,
			};
		} catch {}
	}
	return null;
}

function readFirstTxtFile(lsofOutput: string): Map<string, string> {
	const lines = lsofOutput.split("\n");
	const fields = new Map<string, string>();
	for (const line of lines.slice(lines.indexOf("ftxt") + 1)) {
		if (line.startsWith("f")) break;
		fields.set(line.slice(0, 1), line.slice(1));
	}
	return fields;
}

export async function readRunningExecutable(
	pid: number,
): Promise<ExecutableFile | null> {
	try {
		if (process.platform === "linux") {
			const exeLink = `/proc/${pid}/exe`;
			const [target, stats] = await Promise.all([
				readlink(exeLink),
				stat(exeLink),
			]);
			return {
				path: target.replace(/ \(deleted\)$/, ""),
				fileId: `${stats.dev}:${stats.ino}`,
			};
		}
		if (process.platform !== "darwin") return null;
		const { stdout } = await execFileAsync(
			"/usr/sbin/lsof",
			["-a", "-p", String(pid), "-d", "txt", "-FDin"],
			{ timeout: 5_000 },
		);
		const fields = readFirstTxtFile(stdout);
		const device = fields.get("D");
		const inode = fields.get("i");
		const path = fields.get("n");
		if (!device || !inode || !path) return null;
		return { path, fileId: `${Number.parseInt(device, 16)}:${inode}` };
	} catch {
		return null;
	}
}

/**
 * Whether a process runs another copy of the installed binary. Homebrew keeps
 * the file name across versions and the native installer keeps the folder; a
 * process that matches neither is another program (a reused pid, or `node`
 * running an old npm install) and cannot be compared.
 */
export function isOutdatedExecutable(
	running: ExecutableFile | null,
	installed: ExecutableFile | null,
): boolean {
	if (!running || !installed) return false;
	const isSameInstall =
		basename(running.path) === basename(installed.path) ||
		dirname(running.path) === dirname(installed.path);
	return isSameInstall && running.fileId !== installed.fileId;
}
