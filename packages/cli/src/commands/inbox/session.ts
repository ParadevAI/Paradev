import { randomUUID } from "node:crypto";

const fallbackSessionId = `cli-${randomUUID().slice(0, 8)}`;

/**
 * The card's identity, and what "open the session" navigates to. A host
 * terminal names itself with SUPERSET_TERMINAL_ID; the desktop's own PTY path
 * sets SUPERSET_PANE_ID to the same value it registers the session under.
 * Anything else gets one id for the life of this process, so push and wait
 * from the same shell still agree.
 */
export function agentSessionId(): string {
	return (
		process.env.SUPERSET_TERMINAL_ID?.trim() ||
		process.env.SUPERSET_PANE_ID?.trim() ||
		fallbackSessionId
	);
}
