import type {
	AgentCliInstallSource,
	AgentCliStatus,
} from "@superset/shared/agent-cli-status";

export type UpdateWatch = {
	from: string | null;
	source: AgentCliInstallSource;
	sessionId: string | null;
	until: number;
};

/**
 * Mid-install the binary can be missing, and the wrapper then runs another
 * install further down PATH: only a new version from the same source counts.
 */
export function hasUpdateLanded(
	watch: UpdateWatch,
	status: AgentCliStatus | null,
): boolean {
	return (
		status?.installed != null &&
		status.installed !== watch.from &&
		status.source === watch.source
	);
}
