import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";

/**
 * Microsoft Graph, app-only.
 *
 * The connection holds no user's token: it holds the app's own token for the
 * tenant that consented, acquired with the client credentials grant and cached
 * on the row until it is close to expiring. Nothing here is per user, which is
 * why teams and channels can be listed and messages fetched with no one signed
 * in on the Microsoft side.
 */

export const GRAPH_URL = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MAX_PAGES = 20;

export class GraphError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string | null,
		message: string,
	) {
		super(message);
		this.name = "GraphError";
	}
}

/** The failures that mean the app can no longer act in this tenant at all. */
export function isGraphAuthError(error: unknown): boolean {
	return (
		error instanceof GraphError &&
		(error.status === 401 || error.status === 403)
	);
}

export function microsoftCredentials(): {
	clientId: string;
	clientSecret: string;
} {
	if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
		throw new Error("Microsoft Teams integration is not configured");
	}
	return {
		clientId: env.MICROSOFT_CLIENT_ID,
		clientSecret: env.MICROSOFT_CLIENT_SECRET,
	};
}

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number(),
});

const tokenErrorSchema = z.object({
	error: z.string(),
	error_description: z.string().optional(),
});

async function fetchWithTimeout(
	input: string,
	init: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Asks Entra for an app-only token in `tenantId`. Fails when the tenant has
 * not consented (the app has no service principal there) or the secret is
 * wrong; both surface as a GraphError so callers can tell them from outages.
 */
export async function acquireAppToken(
	tenantId: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
	const { clientId, clientSecret } = microsoftCredentials();
	const response = await fetchWithTimeout(
		`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				scope: "https://graph.microsoft.com/.default",
				grant_type: "client_credentials",
			}),
		},
	);
	const json: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const parsed = tokenErrorSchema.safeParse(json);
		throw new GraphError(
			response.status,
			parsed.success ? parsed.data.error : null,
			parsed.success
				? (parsed.data.error_description ?? parsed.data.error)
				: `Token request failed with ${response.status}`,
		);
	}
	const token = tokenResponseSchema.parse(json);
	return {
		accessToken: token.access_token,
		expiresAt: new Date(Date.now() + token.expires_in * 1000),
	};
}

/**
 * The cached app token for a connection, refreshed under the connection lock
 * when it is within the buffer of expiring. Null when the connection is gone
 * or has been marked disconnected.
 */
export async function getGraphAccessToken(
	connectionId: string,
): Promise<string | null> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				externalOrgId: integrationConnections.externalOrgId,
				disconnectedAt: integrationConnections.disconnectedAt,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);
		if (!connection || connection.disconnectedAt || !connection.externalOrgId) {
			return null;
		}
		if (
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS
		) {
			return connection.accessToken;
		}

		try {
			const token = await acquireAppToken(connection.externalOrgId);
			await tx
				.update(integrationConnections)
				.set({
					accessToken: token.accessToken,
					tokenExpiresAt: token.expiresAt,
					updatedAt: new Date(),
				})
				.where(eq(integrationConnections.id, connectionId));
			return token.accessToken;
		} catch (error) {
			// The tenant admin removed the app, or the secret rotated: no amount
			// of retrying gets a token, so stop pretending the connection works.
			if (
				error instanceof GraphError &&
				(error.code === "unauthorized_client" ||
					error.code === "invalid_client" ||
					error.code === "invalid_grant")
			) {
				await tx
					.update(integrationConnections)
					.set({
						disconnectedAt: new Date(),
						disconnectReason: error.code,
						updatedAt: new Date(),
					})
					.where(eq(integrationConnections.id, connectionId));
				return null;
			}
			throw error;
		}
	});
}

/** The active Teams connection for an organization, or null. */
export async function findTeamsConnection(organizationId: string) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "microsoft_teams"),
		),
	});
	if (!connection || connection.disconnectedAt) return null;
	return connection;
}

const graphErrorSchema = z.object({
	error: z.object({
		code: z.string().optional(),
		message: z.string().optional(),
	}),
});

/** One Graph call. Throws GraphError on a non-2xx; undefined on 204. */
export async function graphRequest<T>(
	accessToken: string,
	path: string,
	init: { method?: string; body?: unknown } = {},
): Promise<T> {
	const url = path.startsWith("https://") ? path : `${GRAPH_URL}${path}`;
	const response = await fetchWithTimeout(url, {
		method: init.method ?? "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
			...(init.body !== undefined
				? { "Content-Type": "application/json" }
				: {}),
		},
		body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
	});
	if (response.status === 204) return undefined as T;
	const json: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const parsed = graphErrorSchema.safeParse(json);
		throw new GraphError(
			response.status,
			parsed.success ? (parsed.data.error.code ?? null) : null,
			parsed.success
				? (parsed.data.error.message ?? `Graph ${response.status}`)
				: `Graph ${response.status} on ${path}`,
		);
	}
	return json as T;
}

/** A collection, following `@odata.nextLink` up to a page cap or `limit` items. */
export async function graphList<T>(
	accessToken: string,
	path: string,
	limit = Number.POSITIVE_INFINITY,
): Promise<T[]> {
	const items: T[] = [];
	let next: string | undefined = path;
	for (let page = 0; next && page < MAX_PAGES && items.length < limit; page++) {
		const body: { value?: T[]; "@odata.nextLink"?: string } =
			await graphRequest(accessToken, next);
		items.push(...(body.value ?? []));
		next = body["@odata.nextLink"];
	}
	return items;
}
