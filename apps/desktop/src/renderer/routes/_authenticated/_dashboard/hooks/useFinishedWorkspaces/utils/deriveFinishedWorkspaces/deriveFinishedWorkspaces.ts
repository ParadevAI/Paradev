import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { getHighestPriorityStatus } from "shared/tabs-types";

export interface FinishedWorkspace {
	workspaceId: string;
	location: "local" | "cloud";
	/** The terminal whose agent finished last; cloud workspaces report none. */
	terminalId: string | null;
	agentId: string | null;
	finishedAt: number;
	/** Every terminal that holds the workspace in this state, with the host's time of its last event: what marking it seen needs. */
	terminals: { terminalId: string; at: number }[];
}

interface Binding {
	workspaceId: string;
	terminalId: string;
	agentId: string;
	lastEventType: string;
	lastEventAt: number;
}

interface CloudWorkspace {
	id: string;
	agentStatus: string | null;
	agentStatusAt: Date | null;
	inSidebar: boolean;
	lastReadAt: number | undefined;
}

/**
 * The workspaces the sidebar marks as finished and not yet looked at: the
 * same status it shows, so a row is here exactly while its dot is.
 */
export function deriveFinishedWorkspaces({
	bindings,
	terminalSeenAt,
	cloud,
}: {
	bindings: Binding[];
	terminalSeenAt: Record<string, number>;
	cloud: CloudWorkspace[];
}): FinishedWorkspace[] {
	const byWorkspace = new Map<string, Binding[]>();
	for (const binding of bindings) {
		byWorkspace.set(binding.workspaceId, [
			...(byWorkspace.get(binding.workspaceId) ?? []),
			binding,
		]);
	}
	const finished: FinishedWorkspace[] = [];
	for (const [workspaceId, own] of byWorkspace) {
		const statuses = own.map((binding) => ({
			binding,
			status: deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: terminalSeenAt[binding.terminalId],
			}),
		}));
		if (getHighestPriorityStatus(statuses.map((s) => s.status)) !== "review")
			continue;
		const review = statuses
			.filter((s) => s.status === "review")
			.map((s) => s.binding)
			.sort((a, b) => b.lastEventAt - a.lastEventAt);
		const latest = review[0];
		if (!latest) continue;
		finished.push({
			workspaceId,
			location: "local",
			terminalId: latest.terminalId,
			agentId: latest.agentId,
			finishedAt: latest.lastEventAt,
			terminals: review.map((binding) => ({
				terminalId: binding.terminalId,
				at: binding.lastEventAt,
			})),
		});
	}
	for (const workspace of cloud) {
		if (!workspace.inSidebar || workspace.agentStatus !== "review") continue;
		const at = workspace.agentStatusAt?.getTime();
		if (at === undefined || (workspace.lastReadAt ?? 0) >= at) continue;
		if (byWorkspace.has(workspace.id)) continue;
		finished.push({
			workspaceId: workspace.id,
			location: "cloud",
			terminalId: null,
			agentId: null,
			finishedAt: at,
			terminals: [],
		});
	}
	return finished.sort((a, b) => b.finishedAt - a.finishedAt);
}
