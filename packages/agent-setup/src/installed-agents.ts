import fs from "node:fs";
import path from "node:path";
import type { AgentSetupTargetId } from "./agent-setup-targets";
import { getBinDir, resolveUserHomeDir } from "./paths";

interface AgentFootprint {
	binaries: readonly string[];
	homeDirs: readonly string[];
}

const AGENT_FOOTPRINTS: Record<AgentSetupTargetId, AgentFootprint> = {
	amp: { binaries: ["amp"], homeDirs: [".config/amp"] },
	claude: { binaries: ["claude"], homeDirs: [".claude"] },
	codex: { binaries: ["codex"], homeDirs: [".codex"] },
	droid: { binaries: ["droid"], homeDirs: [".factory"] },
	opencode: { binaries: ["opencode"], homeDirs: [".config/opencode"] },
	omp: { binaries: ["omp"], homeDirs: [".omp"] },
	pi: { binaries: ["pi"], homeDirs: [".pi"] },
	"cursor-agent": {
		binaries: ["cursor-agent"],
		homeDirs: [".cursor"],
	},
	gemini: { binaries: ["gemini"], homeDirs: [".gemini"] },
	mastracode: { binaries: ["mastracode"], homeDirs: [".mastracode"] },
	kimi: { binaries: ["kimi"], homeDirs: [".kimi-code"] },
	grok: { binaries: ["grok"], homeDirs: [".grok"] },
	copilot: { binaries: ["copilot"], homeDirs: [".copilot"] },
	vibe: { binaries: ["vibe"], homeDirs: [".vibe"] },
	devin: { binaries: ["devin"], homeDirs: [".config/devin"] },
	muse: { binaries: ["muse"], homeDirs: [".config/muse"] },
	ufo: { binaries: ["ufo"], homeDirs: [] },
	agy: { binaries: ["agy"], homeDirs: [] },
};

const EXTRA_BINARY_DIRS = [
	".local/bin",
	".bun/bin",
	".cargo/bin",
	".npm-global/bin",
	".claude/local",
	".volta/bin",
];

const SYSTEM_BINARY_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

export function defaultBinarySearchDirs(): string[] {
	const home = resolveUserHomeDir();
	const wrapperDir = path.resolve(getBinDir());
	const fromPath = (process.env.PATH ?? "").split(path.delimiter);
	return [
		...fromPath,
		...EXTRA_BINARY_DIRS.map((dir) => path.join(home, dir)),
		...SYSTEM_BINARY_DIRS,
	].filter((dir) => dir && path.resolve(dir) !== wrapperDir);
}

function hasBinary(names: readonly string[], dirs: readonly string[]): boolean {
	const extensions = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
	return names.some((name) =>
		dirs.some((dir) =>
			extensions.some((extension) => {
				try {
					fs.accessSync(path.join(dir, name + extension), fs.constants.X_OK);
					return true;
				} catch {
					return false;
				}
			}),
		),
	);
}

/**
 * An agent counts as installed when its binary is on PATH (or a usual install
 * dir — Finder-launched apps get a minimal PATH) or its home config dir
 * exists. Superset's own wrapper dir is ignored.
 */
export function isAgentInstalled(
	agentId: AgentSetupTargetId,
	binaryDirs: readonly string[] = defaultBinarySearchDirs(),
): boolean {
	const footprint = AGENT_FOOTPRINTS[agentId];
	const home = resolveUserHomeDir();
	if (footprint.homeDirs.some((dir) => fs.existsSync(path.join(home, dir)))) {
		return true;
	}
	return hasBinary(footprint.binaries, binaryDirs);
}
