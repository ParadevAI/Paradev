import type { CloudAgentLaunch } from "@superset/shared/cloud-agent-launch";

/**
 * The launch a box runs at first boot. Every launch gets a terminal id, so
 * any client can open the agent's pane before the box is up, not only the
 * one that created the workspace.
 */
export function queuedLaunch(
	launch: CloudAgentLaunch,
	openAsChat: boolean,
): CloudAgentLaunch {
	return {
		...launch,
		surface: openAsChat ? "chat" : undefined,
		terminalId: launch.terminalId ?? crypto.randomUUID(),
	};
}
