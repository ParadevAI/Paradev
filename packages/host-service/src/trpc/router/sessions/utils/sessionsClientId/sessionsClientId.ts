/**
 * The client id of a prompt sent through this router. Clients key a user
 * message by its client id, so it must be unique per prompt.
 */
export function sessionsClientId(commandId: string): string {
	return `superset-sessions:${commandId}`;
}
