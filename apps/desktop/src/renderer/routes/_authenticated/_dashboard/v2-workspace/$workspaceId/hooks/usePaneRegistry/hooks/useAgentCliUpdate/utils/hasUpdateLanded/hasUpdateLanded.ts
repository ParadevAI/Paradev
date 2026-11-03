import type { AgentCliStatus } from "@superset/shared/agent-cli-status";

export type UpdateWatch = {
	from: string | null;
	command: string;
	sessionId: string | null;
	until: number;
	/** The terminal running the update command, once it opened. */
	terminalId?: string;
	/** Whether the update command was seen running in that terminal. */
	ran?: boolean;
};

/**
 * Mid-install the binary can be missing, and the wrapper then runs another
 * install further down PATH, even one from the same package manager. Only a
 * new version of the same install counts, and its update command names it.
 */
export function hasUpdateLanded(
	watch: UpdateWatch,
	status: AgentCliStatus | null,
): boolean {
	return (
		status?.installed != null &&
		status.installed !== watch.from &&
		status.updateCommand === watch.command
	);
}
