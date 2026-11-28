import { TELEMETRY_HEADER } from "@superset/shared/constants";
import { SUPERSET_USER_ID_HEADER } from "@superset/shared/host-routing";
import { getJwt, hasExpiredJwt, waitForFreshJwt } from "./auth-client";
import { isTelemetryEnabled } from "./telemetry";

const RELAY_TOKEN_WAIT_MS = 5_000;

/**
 * The bearer a host accepts, by URL. A local host-service takes its
 * pre-shared secret; a cloud workspace's takes the short-lived token
 * `cloudWorkspace.access` signs for that one sandbox — brokered and expiring,
 * so it is held per URL rather than baked into the client, and re-set on
 * every re-mint. Anything else (a relay-reached host) authenticates with the
 * user's JWT.
 */
const secrets = new Map<string, string>();

let clientMachineId: string | null = null;
let clientUserId: string | null = null;

export function setClientMachineId(machineId: string): void {
	clientMachineId = machineId;
}

/**
 * The signed-in user, sent on every host-service call so the host can stamp
 * `createdByUserId` on what this client creates. A local host trusts it
 * because the caller holds its secret; the relay replaces it with the JWT
 * subject before a remote host ever sees it.
 */
export function setClientUserId(userId: string | null): void {
	clientUserId = userId;
}

export function setHostServiceSecret(hostUrl: string, secret: string): void {
	secrets.set(hostUrl, secret);
}

export function removeHostServiceSecret(hostUrl: string): void {
	secrets.delete(hostUrl);
}

export function getHostServiceHeaders(hostUrl: string): Record<string, string> {
	const headers: Record<string, string> = clientMachineId
		? { "x-superset-client-machine-id": clientMachineId }
		: {};
	if (clientUserId) headers[SUPERSET_USER_ID_HEADER] = clientUserId;
	const secret = secrets.get(hostUrl);
	if (secret) {
		headers.Authorization = `Bearer ${secret}`;
		return headers;
	}
	// Relay: use JWT
	const jwt = getJwt();
	if (jwt) headers.Authorization = `Bearer ${jwt}`;
	if (!isTelemetryEnabled()) headers[TELEMETRY_HEADER] = "off";
	return headers;
}

/** True when the host is reached through the relay, with the user's JWT. */
export function usesRelayJwt(hostUrl: string): boolean {
	return !secrets.has(hostUrl);
}

/**
 * For request paths that can wait: a relay call made with no JWT or an expired
 * one is refused, so refresh the token before building the headers.
 */
export async function resolveHostServiceHeaders(
	hostUrl: string,
	refreshJwt: () => Promise<unknown> = () =>
		waitForFreshJwt(RELAY_TOKEN_WAIT_MS),
	jwtIsUnusable: () => boolean = () => getJwt() === null || hasExpiredJwt(),
): Promise<Record<string, string>> {
	if (usesRelayJwt(hostUrl) && jwtIsUnusable()) await refreshJwt();
	return getHostServiceHeaders(hostUrl);
}

/**
 * A browser can't set headers on a WebSocket upgrade, so the socket routes
 * read the same bearer from the `token` query param instead.
 */
export function getHostServiceWsToken(hostUrl: string): string | null {
	return secrets.get(hostUrl) ?? getJwt();
}
