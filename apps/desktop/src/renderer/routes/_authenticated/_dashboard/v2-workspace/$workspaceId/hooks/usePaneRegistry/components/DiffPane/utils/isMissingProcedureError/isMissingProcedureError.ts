/** True when a tRPC call failed because the server doesn't know the procedure.
 *
 * Desktop and host-service ship from one version, but a remote or cloud
 * workspace runs host-service inside its own sandbox (see
 * docs/cloud-sandbox-mismatches.md) and can be older than the app talking to
 * it. There's no capability negotiation between them, so a procedure added on
 * the desktop side has to detect its own absence and fall back. */
export function isMissingProcedureError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const code = (error as { data?: { code?: unknown } }).data?.code;
	if (code === "NOT_FOUND") return true;
	const message = (error as { message?: unknown }).message;
	return (
		typeof message === "string" &&
		/no procedure found|not found on server|NOT_FOUND/i.test(message)
	);
}
