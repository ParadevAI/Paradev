import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../router/plugins/crypto";
import { credentialFetch } from "../../router/plugins/manifest";
import {
	ForgottenClientError,
	forgetClient,
	redirectUriFor,
} from "./client-identity";
import {
	connectorMethod,
	type ResolvedEndpoints,
	requireConnector,
	resolveEndpoints,
} from "./index";

const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;
const RACE_SETTLE_MS = 1000;
export const NEEDS_REAUTH = "needs_reauth";

export class UnrefreshableConnectionError extends Error {
	constructor(connector: string) {
		super(
			`The ${connector} connection expired and carries no refresh token; reconnect it.`,
		);
		this.name = "UnrefreshableConnectionError";
	}
}

/**
 * The token endpoint was unreachable, answered 5xx or 429, or sent a body that
 * is not JSON. The connection is not
 * known to be bad, so it must not be disconnected or reported as needing
 * reauthorization — the caller is expected to surface this as a bad gateway.
 */
export class ConnectorUnavailableError extends Error {
	constructor(
		readonly connector: string,
		detail: string,
	) {
		super(`The ${connector} token endpoint is unavailable: ${detail}`);
		this.name = "ConnectorUnavailableError";
	}
}

function expiringSoon(expiresAt: Date | null, bufferSeconds: number): boolean {
	if (!expiresAt) return false;
	return expiresAt.getTime() - Date.now() <= bufferSeconds * 1000;
}

function live(id: string) {
	return and(eq(connections.id, id), isNull(connections.disconnectedAt));
}

async function readConnection(id: string): Promise<SelectConnection | null> {
	const [row] = await db.select().from(connections).where(live(id)).limit(1);
	return row ?? null;
}

/**
 * A connection that cannot be refreshed stays a row: marking it here is what
 * lets `connectors.status` say "Reconnect" rather than "Connect", instead of
 * every caller rediscovering the failure. `upsertConnection` clears both
 * fields when the user reconnects.
 */
export async function markNeedsReauth(
	id: string,
	storedAccessToken?: string,
): Promise<void> {
	await db
		.update(connections)
		.set({ disconnectedAt: new Date(), disconnectReason: NEEDS_REAUTH })
		.where(
			storedAccessToken === undefined
				? live(id)
				: and(live(id), eq(connections.accessToken, storedAccessToken)),
		);
}

const inFlight = new Map<string, Promise<SelectConnection>>();

export async function ensureFreshConnection(
	row: SelectConnection,
	{ raceSettleMs = RACE_SETTLE_MS }: { raceSettleMs?: number } = {},
): Promise<SelectConnection> {
	const connector = requireConnector(row.connector);
	const method = connectorMethod(
		connector,
		row.authMethod as never as undefined,
	);
	if (method.type !== "oauth2") return row;

	const buffer =
		method.token_expiration_buffer ?? DEFAULT_EXPIRY_BUFFER_SECONDS;
	if (!expiringSoon(row.tokenExpiresAt, buffer)) return row;

	// Concurrent requests for one connection nearly always land in the same
	// process, so collapsing them here is what keeps the token endpoint from
	// being asked the same question N times.
	const pending = inFlight.get(row.id);
	if (pending) return await pending;

	const load = refresh(row, buffer, raceSettleMs).finally(() => {
		inFlight.delete(row.id);
	});
	inFlight.set(row.id, load);
	return await load;
}

/**
 * Deliberately not wrapped in a transaction. The token endpoint is a third
 * party on the other side of the internet, and holding a pooled connection
 * across that call means one slow identity provider drains the pool for every
 * unrelated query in the process. Mutual exclusion comes from the in-flight map
 * above within a process, and from the compare-and-swap in `store` across them:
 * a refresh that loses the race adopts whichever row `reconcile` finds live.
 */
async function refresh(
	row: SelectConnection,
	buffer: number,
	raceSettleMs: number,
): Promise<SelectConnection> {
	const current = await readConnection(row.id);
	if (!current) return row;
	if (!expiringSoon(current.tokenExpiresAt, buffer)) return current;

	const refreshToken = await decryptOptional(current.refreshToken);
	if (!refreshToken) {
		await markNeedsReauth(current.id);
		throw new UnrefreshableConnectionError(current.connector);
	}

	const connector = requireConnector(current.connector);
	const method = connectorMethod(
		connector,
		current.authMethod as never as undefined,
	);
	// The refresh token is bound to the client it was issued to; any other one,
	// even for the same server, gets invalid_client.
	const endpoints = await resolveEndpoints(
		current.connector,
		method,
		redirectUriFor(current.connector),
		{ issuedTo: current.oauthClientId },
	).catch(async (error: unknown) => {
		if (!(error instanceof ForgottenClientError)) throw error;
		await markNeedsReauth(current.id, current.accessToken);
		throw new UnrefreshableConnectionError(current.connector);
	});
	const redemption = await redeem(current, endpoints, refreshToken);
	if (redemption.kind === "rejected") {
		// Rotating refresh tokens are single-use: when another process redeemed
		// ours first, the rejection means we lost the race, not that the grant died.
		const winner = await racedRefresh(current, raceSettleMs);
		if (winner) return winner;

		if (endpoints.issuer && redemption.oauthError === "invalid_client")
			await forgetClient(
				endpoints.issuer,
				redirectUriFor(current.connector),
				endpoints.clientId,
			);
		await markNeedsReauth(current.id, current.accessToken);
		throw new UnrefreshableConnectionError(current.connector);
	}

	const updated = await store(current, redemption.tokens, refreshToken);
	if (updated) return updated;

	// Zero rows means another process refreshed between our read and our write.
	const winner = await readConnection(current.id);
	if (!winner) return current;
	return await reconcile(winner, endpoints, redemption.tokens, refreshToken);
}

async function reconcile(
	winner: SelectConnection,
	endpoints: ResolvedEndpoints,
	ours: IssuedTokens,
	ourRedeemedToken: string,
): Promise<SelectConnection> {
	const winnerToken = await decryptOptional(winner.refreshToken);
	if (!winnerToken) return winner;

	let check: Redemption;
	try {
		check = await redeem(winner, endpoints, winnerToken);
	} catch (error) {
		if (error instanceof ConnectorUnavailableError) return winner;
		throw error;
	}
	const [held, heldRedeemedToken] =
		check.kind === "issued"
			? [check.tokens, winnerToken]
			: [ours, ourRedeemedToken];
	const kept =
		check.kind === "issued" || check.oauthError === "invalid_grant"
			? await store(winner, held, heldRedeemedToken)
			: undefined;
	if (kept) return kept;

	const latest = await readConnection(winner.id);
	if (!latest || latest.refreshToken === winner.refreshToken) return winner;
	return await reconcile(latest, endpoints, held, heldRedeemedToken);
}

type IssuedTokens = Record<string, unknown> & { access_token: string };

type Redemption =
	| { kind: "issued"; tokens: IssuedTokens }
	| { kind: "rejected"; oauthError: string | undefined };

async function redeem(
	connection: SelectConnection,
	endpoints: ResolvedEndpoints,
	refreshToken: string,
): Promise<Redemption> {
	const { clientId, clientSecret } = endpoints;
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	if (endpoints.authentication === "basic")
		headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
	else {
		body.set("client_id", clientId);
		if (clientSecret) body.set("client_secret", clientSecret);
	}

	let response: Response;
	try {
		response = await credentialFetch(
			endpoints.tokenEndpoint,
			{ method: "POST", headers, body },
			`Connector "${connection.connector}" refresh`,
		);
	} catch (error) {
		throw new ConnectorUnavailableError(
			connection.connector,
			error instanceof Error ? error.message : String(error),
		);
	}
	// A server that is failing tells us nothing about the token; treating it as
	// expired would disconnect a good connection over someone else's outage.
	if (response.status >= 500) {
		throw new ConnectorUnavailableError(
			connection.connector,
			`${response.status} ${response.statusText}`,
		);
	}
	const parsed: unknown = await response.json().catch(() => null);
	const payload =
		parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	if (payload && response.ok && typeof payload.access_token === "string")
		return { kind: "issued", tokens: payload as IssuedTokens };

	const oauthError =
		typeof payload?.error === "string" ? payload.error : undefined;
	console.warn(`[connectors/${connection.connector}] refresh refused`, {
		connectionId: connection.id,
		status: response.status,
		oauthError,
		description:
			typeof payload?.error_description === "string"
				? payload.error_description.slice(0, 200)
				: undefined,
	});
	if (response.status === 429 || !payload) {
		throw new ConnectorUnavailableError(
			connection.connector,
			`${response.status} ${response.statusText}`,
		);
	}
	return { kind: "rejected", oauthError };
}

async function store(
	base: SelectConnection,
	tokens: IssuedTokens,
	redeemedToken: string,
): Promise<SelectConnection | undefined> {
	const expiresIn = tokens.expires_in;
	const [updated] = await db
		.update(connections)
		.set({
			accessToken: await encryptSecret(tokens.access_token),
			refreshToken:
				typeof tokens.refresh_token === "string"
					? await encryptSecret(tokens.refresh_token)
					: await encryptOptional(redeemedToken),
			tokenExpiresAt:
				typeof expiresIn === "number"
					? new Date(Date.now() + expiresIn * 1000)
					: null,
			disconnectedAt: null,
			disconnectReason: null,
		})
		.where(
			and(
				eq(connections.id, base.id),
				// A racing loser may have marked this generation before we wrote it.
				or(
					isNull(connections.disconnectedAt),
					eq(connections.disconnectReason, NEEDS_REAUTH),
				),
				base.tokenExpiresAt
					? eq(connections.tokenExpiresAt, base.tokenExpiresAt)
					: isNull(connections.tokenExpiresAt),
			),
		)
		.returning();
	return updated;
}

async function racedRefresh(
	current: SelectConnection,
	settleMs: number,
): Promise<SelectConnection | null> {
	for (const wait of [0, settleMs]) {
		if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
		const latest = await readConnection(current.id);
		if (latest && latest.accessToken !== current.accessToken) return latest;
	}
	return null;
}

export async function connectionAccessToken(
	row: SelectConnection,
): Promise<string> {
	const fresh = await ensureFreshConnection(row);
	return await decryptSecret(fresh.accessToken);
}
