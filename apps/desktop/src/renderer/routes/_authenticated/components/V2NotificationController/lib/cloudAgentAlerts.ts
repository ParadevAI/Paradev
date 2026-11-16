import type { ActiveAgentStatus } from "@superset/shared/agent-status";
import type { AgentLifecyclePayload } from "@superset/workspace-client";

type AgentLifecycleEventType = AgentLifecyclePayload["eventType"];

export interface ReportedAgentStatus {
	status: ActiveAgentStatus | null;
	at: number | null;
}

const ALERT_EVENT_BY_STATUS: Partial<
	Record<ActiveAgentStatus, AgentLifecycleEventType>
> = {
	review: "Stop",
	permission: "PermissionRequest",
	failed: "Failed",
};

/**
 * The first sighting of a workspace only records its status: a status that
 * was already there when the app opened is not news.
 */
export function getCloudAgentAlertEvent(
	previous: ReportedAgentStatus | undefined,
	current: ReportedAgentStatus,
): AgentLifecycleEventType | null {
	if (!previous || !current.status || current.at === null) return null;
	const eventType = ALERT_EVENT_BY_STATUS[current.status];
	if (!eventType) return null;
	if (previous.status === current.status) return null;
	if (previous.at !== null && current.at <= previous.at) return null;
	return eventType;
}
