const SESSION_NOT_RUNNING = /^chat session (.+) is not running$/;

export function sessionNotRunningMessage(sessionId: string): string {
	return `chat session ${sessionId} is not running`;
}

/** The chat a host refused because it has no agent running for it, or null for any other error. */
export function notRunningSessionId(
	message: string | null | undefined,
): string | null {
	return (message && SESSION_NOT_RUNNING.exec(message)?.[1]) || null;
}
