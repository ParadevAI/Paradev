const NOT_RUNNING = /^chat session .+ is not running$/;

/** The host answers this when it has no agent for the chat, as after it restarted. */
export function isSessionNotRunning(error: string | null): boolean {
	return error !== null && NOT_RUNNING.test(error);
}
