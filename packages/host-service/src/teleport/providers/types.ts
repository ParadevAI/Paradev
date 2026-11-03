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
};

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
	return {
		version: 1,
		harnessSessionId: manifest.harnessSessionId,
		sourceCwd: manifest.sourceCwd,
		sourceDir: manifest.sourceDir,
	};
}

/**
 * Moves one agent's own session files between hosts. The rest of a move
 * (history, git, the new workspace) is the same for every agent.
 */
export type TeleportProvider = {
	harnesses: readonly string[];
	/** Copies the session's files into `stageDir`; returns what `place` needs. */
	collect(input: {
		harnessSessionId: string;
		worktreePath: string;
		env: HarnessEnv;
		locate: () => Promise<string | null>;
		stageDir: string;
	}): Promise<BundleManifest>;
	/** Puts the files from `stageDir` where the agent looks, paths rewritten. */
	place(input: {
		manifest: BundleManifest;
		worktreePath: string;
		env: HarnessEnv;
		stageDir: string;
	}): Promise<void>;
};
