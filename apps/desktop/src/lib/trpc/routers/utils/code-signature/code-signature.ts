import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Apple Developer ID Team IDs of the vendors whose tools the app installs. */
export const TEAM_IDS = {
	anthropic: "Q6L2SF6YDW",
	openai: "2DC432GLL2",
	github: "VEKTX9H2N7",
} as const;

export function teamIdFromCodesign(output: string): string | null {
	return output.match(/^TeamIdentifier=(\S+)$/m)?.[1] ?? null;
}

/** True when macOS accepts the signature and it names `teamId`. */
export async function isSignedByTeam(
	binaryPath: string,
	teamId: string,
): Promise<boolean> {
	try {
		await execFileAsync(
			"/usr/bin/codesign",
			["--verify", "--strict", binaryPath],
			{ timeout: 60_000 },
		);
		const { stderr } = await execFileAsync(
			"/usr/bin/codesign",
			["-dv", "--verbose=2", binaryPath],
			{ timeout: 60_000 },
		);
		return teamIdFromCodesign(stderr) === teamId;
	} catch {
		return false;
	}
}
