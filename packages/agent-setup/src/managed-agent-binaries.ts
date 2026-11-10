import path from "node:path";
import { resolveAppHomeDir, resolveUserHomeDir } from "./paths";

export type ManagedCodingAgent = "claude" | "codex";

/**
 * Where an agent Paradev installed lives. Claude Code's path is its own
 * native installer's, so the copy updates itself and stays the user's.
 */
export function managedAgentBinaryPath(agent: ManagedCodingAgent): string {
	return agent === "claude"
		? path.join(resolveUserHomeDir(), ".local", "bin", "claude")
		: path.join(resolveAppHomeDir(), "agents", "bin", "codex");
}

export function managedCodexRootDir(): string {
	return path.join(resolveAppHomeDir(), "agents", "codex");
}

export function isManagedCodingAgent(
	binary: string,
): binary is ManagedCodingAgent {
	return binary === "claude" || binary === "codex";
}
