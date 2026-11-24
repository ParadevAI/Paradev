import { posix, win32 } from "node:path";
import type { HarnessEnv } from "../../terminal-agents/harness-sessions/types";

/** Where an agent's session files were recorded, packed with them. */
export type BundleManifest = {
	version: 1;
	harnessSessionId: string;
	/** The working directory the agent ran in, as it recorded it. */
	sourceCwd: string;
	/** The directory the files sat in, which absolute paths inside them name. */
	sourceDir: string;
	/** The chat's permission mode and model, which its history does not carry. */
	selections?: { modeId?: string; modelId?: string };
};

const MAX_SELECTION_LENGTH = 200;

function selectionValue(value: unknown): string | undefined {
	return typeof value === "string" &&
		value.length > 0 &&
		value.length <= MAX_SELECTION_LENGTH
		? value
		: undefined;
}

const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

/** An id safe to name a file with: no separators, dots or `..`. */
export function isPlainSessionId(id: unknown): id is string {
	return typeof id === "string" && PLAIN_ID.test(id);
}

function isAbsolutePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		(posix.isAbsolute(value) || win32.isAbsolute(value))
	);
}

/** A manifest read from a bundle, or null when it is not one this host reads. */
export function parseBundleManifest(value: unknown): BundleManifest | null {
	if (typeof value !== "object" || value === null) return null;
	const manifest = value as Record<string, unknown>;
	if (manifest.version !== 1) return null;
	if (!isPlainSessionId(manifest.harnessSessionId)) return null;
	if (!isAbsolutePath(manifest.sourceCwd)) return null;
	if (!isAbsolutePath(manifest.sourceDir)) return null;
	const selections =
		typeof manifest.selections === "object" && manifest.selections !== null
			? (manifest.selections as Record<string, unknown>)
			: {};
	const modeId = selectionValue(selections.modeId);
	const modelId = selectionValue(selections.modelId);
	return {
		version: 1,
		harnessSessionId: manifest.harnessSessionId,
		sourceCwd: manifest.sourceCwd,
		sourceDir: manifest.sourceDir,
		...(modeId || modelId
			? {
					selections: {
						...(modeId ? { modeId } : {}),
						...(modelId ? { modelId } : {}),
					},
				}
			: {}),
	};
}

/**
 * Moves one agent's own session files between hosts. The rest of a move
 * (history, git, the new workspace) is the same for every agent.
 */
export type TeleportProvider = {
	harnesses: readonly string[];
	/** Terminal agents whose sessions this provider moves, by agent id. */
	terminalAgents: readonly string[];
	/**
	 * Copies the session's files into `stageDir`; returns what `place` needs,
	 * or null when the agent has not written its session yet.
	 */
	collect(input: {
		harnessSessionId: string;
		worktreePath: string;
		env: HarnessEnv;
		locate: () => Promise<string | null>;
		stageDir: string;
	}): Promise<BundleManifest | null>;
	/** Puts the files from `stageDir` where the agent looks, paths rewritten. */
	place(input: {
		manifest: BundleManifest;
		worktreePath: string;
		env: HarnessEnv;
		stageDir: string;
	}): Promise<void>;
};
