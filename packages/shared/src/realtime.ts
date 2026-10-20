import { type ActiveAgentStatus, isActiveAgentStatus } from "./agent-status";

// A change that fits in a patch never turns into a refetch.
export const REALTIME_NUDGE_KINDS = [
	"hosts",
	"cloud_workspaces",
	"automation_runs",
] as const;

export type RealtimeNudgeKind = (typeof REALTIME_NUDGE_KINDS)[number];

/** A patch to one listed row's agent status. */
export interface RealtimeCloudWorkspaceUpdate {
	kind: "cloud_workspaces";
	workspaceId: string;
	agentStatus: ActiveAgentStatus | null;
	agentStatusAt: number;
}

export type RealtimeUpdate = RealtimeCloudWorkspaceUpdate;

export interface RealtimeNudgeMessage {
	type: "nudge";
	kinds: RealtimeNudgeKind[];
	updates: RealtimeUpdate[];
}

export function isRealtimeNudgeKind(
	value: unknown,
): value is RealtimeNudgeKind {
	return (
		typeof value === "string" &&
		(REALTIME_NUDGE_KINDS as readonly string[]).includes(value)
	);
}

export function isRealtimeUpdate(value: unknown): value is RealtimeUpdate {
	if (typeof value !== "object" || value === null) return false;
	const update = value as Record<string, unknown>;
	if (
		update.kind !== "cloud_workspaces" ||
		typeof update.workspaceId !== "string" ||
		update.workspaceId.length === 0
	) {
		return false;
	}
	return (
		update.agentStatus !== undefined &&
		(update.agentStatus === null || isActiveAgentStatus(update.agentStatus)) &&
		typeof update.agentStatusAt === "number"
	);
}

export function parseRealtimeNudgeMessage(
	raw: unknown,
): RealtimeNudgeMessage | null {
	if (typeof raw !== "string") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== "nudge" ||
		!Array.isArray((parsed as { kinds?: unknown }).kinds)
	) {
		return null;
	}
	const message = parsed as { kinds: unknown[]; updates?: unknown };
	const kinds = message.kinds.filter(isRealtimeNudgeKind);
	const updates = Array.isArray(message.updates)
		? message.updates.filter(isRealtimeUpdate)
		: [];
	return { type: "nudge", kinds, updates };
}

/** Subscribe path for an organization's nudges, relative to the realtime origin. */
export function realtimeNudgesPath(organizationId: string): string {
	return `/v2/org/${encodeURIComponent(organizationId)}/nudges`;
}

/** A cloud workspace's presence socket, relative to the realtime origin. */
export function realtimeWorkspacePresencePath(
	organizationId: string,
	workspaceId: string,
): string {
	return `/organization/${encodeURIComponent(organizationId)}/workspace/${encodeURIComponent(workspaceId)}`;
}
