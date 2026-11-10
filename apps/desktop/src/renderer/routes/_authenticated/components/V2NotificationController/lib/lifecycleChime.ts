import type { AgentLifecyclePayload } from "@superset/workspace-client";

/**
 * An agent that failed before it started has the user still at the chat they
 * just sent, so it gets no chime. On a Mac whose output device also records
 * (a headset, a VM), any sound the app plays makes macOS ask for the microphone.
 */
export function lifecycleChimes(payload: AgentLifecyclePayload): boolean {
	return (
		payload.eventType !== "Failed" || payload.agent?.sessionId !== undefined
	);
}
