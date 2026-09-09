/**
 * The host keeps the workspace when a requested agent fails to spawn: the
 * launch outcome comes back per entry in `agents[]` instead of throwing. A
 * caller that passed `agents` asked for work to start, so a spawn failure is
 * a failed create outcome — surface the host errors instead of soft-succeeding
 * with "Workspace created" / "Sent to agent" over an empty agent pane.
 *
 * Returns the host's own error text, which is not translated. The host builds
 * that text from `err.message`, so it can be blank; `unknownError` carries the
 * caller's translated stand-in for those.
 */
export function agentLaunchFailureDetail(
	agents:
		| ReadonlyArray<{ ok: true } | { ok: false; error: string }>
		| undefined,
	unknownError: string,
): string | null {
	const errors: string[] = [];
	for (const agent of agents ?? []) {
		if (agent.ok) continue;
		errors.push(agent.error.trim() || unknownError);
	}
	if (errors.length === 0) return null;
	return errors.join("; ");
}
