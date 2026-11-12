import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function isTranslatedByRosetta(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync(
			"/usr/sbin/sysctl",
			["-n", "sysctl.proc_translated"],
			{ timeout: 5_000 },
		);
		return stdout.trim() === "1";
	} catch {
		return false;
	}
}

/**
 * The Mac's own CPU. The x64 app reports x64 under Rosetta on Apple silicon,
 * so check, as Claude Code's install.sh does, and download the arm64 build.
 */
export async function macArch(
	processArch: string = process.arch,
	translated: () => Promise<boolean> = isTranslatedByRosetta,
): Promise<"arm64" | "x64"> {
	if (processArch === "arm64") return "arm64";
	return (await translated()) ? "arm64" : "x64";
}
