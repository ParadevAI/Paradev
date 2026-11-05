import type { SessionState } from "@superset/chat/protocol";

export function sessionInfoFromState(
	state: SessionState | null,
	agentSessionId: string | undefined,
): { harnessSessionId?: string; title?: string; modeId?: string } {
	// A resume that found no transcript lands on a different agent session.
	// Keep the pane pointed at the live one, or the trip back to the CLI
	// resumes an id that no longer exists.
	const bound = state?.harnessSessionId;
	return {
		...(bound && bound !== agentSessionId ? { harnessSessionId: bound } : {}),
		...(state?.title ? { title: state.title } : {}),
		...(state?.modeId ? { modeId: state.modeId } : {}),
	};
}
