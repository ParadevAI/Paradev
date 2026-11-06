import { type ChatSelections, sessionSelections } from "@superset/chat/core";
import type { SessionState } from "@superset/chat/protocol";

export type SessionInfo = ChatSelections & {
	harnessSessionId?: string;
	title?: string;
};

export function sessionInfoFromState(
	state: SessionState | null,
	agentSessionId: string | undefined,
): SessionInfo {
	// A resume that found no transcript lands on a different agent session.
	// Keep the pane pointed at the live one, or the trip back to the CLI
	// resumes an id that no longer exists.
	const bound = state?.harnessSessionId;
	return {
		...(bound && bound !== agentSessionId ? { harnessSessionId: bound } : {}),
		...(state?.title ? { title: state.title } : {}),
		...sessionSelections(state),
	};
}
