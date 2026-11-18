/**
 * How an agent CLI was installed, read from where its binary lives. `managed`
 * is a CLI the host's image owns, as in a cloud workspace, which the user
 * cannot update.
 */
export type AgentCliInstallSource =
	| "native"
	| "npm"
	| "bun"
	| "pnpm"
	| "homebrew"
	| "managed"
	| "unknown";

/** The `code` on a chat's start error when its CLI is older than chat needs. */
export const AGENT_CLI_OUTDATED = "agent_cli_outdated";

export interface AgentCliStatus {
	binary: string;
	installed: string | null;
	/** Null when chat takes any version. */
	minVersion: string | null;
	belowFloor: boolean;
	/** Null when the newest release is unknown, or not worth comparing against. */
	latest: string | null;
	behind: boolean;
	source: AgentCliInstallSource;
	/** Null when no command is known to update this install safely. */
	updateCommand: string | null;
}
