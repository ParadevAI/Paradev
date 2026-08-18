import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import {
	GOOGLE_API_TIMEOUT_MS,
	REFRESH_BUFFER_MS,
	REFRESH_TOKEN_TIMEOUT_MS,
} from "./constants";

export const googleTokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number(),
	// Only on the initial exchange, and on a refresh when Google chooses to
	// rotate. Absent means keep the one already stored.
	refresh_token: z.string().optional(),
	scope: z.string().optional(),
	token_type: z.string().optional(),
	id_token: z.string().optional(),
});
export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

export class GoogleApiError extends Error {
	constructor(
		readonly status: number,
		readonly url: string,
		readonly body: string,
	) {
		super(`Google API ${status} for ${url}: ${body.slice(0, 300)}`);
		this.name = "GoogleApiError";
	}
}

type RefreshResult =
	| { disconnected: true }
	| { disconnected: false; accessToken: string };

/**
 * Refreshes under the connection's advisory lock so two concurrent callers do
 * not both spend the refresh token. Google's refresh tokens do not usually
 * rotate, but when the response carries one it replaces the stored one.
 */
export async function refreshGoogleToken(
	connectionId: string,
	// After a 401 the stored expiry is not to be trusted — the token was
	// revoked or the clock is off — so the caller forces a real refresh.
	options: { force?: boolean } = {},
): Promise<RefreshResult> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				refreshToken: integrationConnections.refreshToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				disconnectedAt: integrationConnections.disconnectedAt,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);

		if (!connection?.refreshToken || connection.disconnectedAt) {
			return { disconnected: true };
		}
		if (
			!options.force &&
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
		) {
			return { disconnected: false, accessToken: connection.accessToken };
		}

		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			REFRESH_TOKEN_TIMEOUT_MS,
		);
		let response: Response;
		try {
			response = await fetch("https://oauth2.googleapis.com/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				signal: controller.signal,
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: connection.refreshToken,
					client_id: env.GOOGLE_CLIENT_ID,
					client_secret: env.GOOGLE_CLIENT_SECRET,
				}),
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as {
				error?: string;
			};
			// The grant was revoked (or the app's access removed in the account
			// settings). Nothing here can recover it; the person has to reconnect.
			if (body?.error === "invalid_grant") {
				await tx
					.update(integrationConnections)
					.set({
						disconnectedAt: new Date(),
						disconnectReason: "invalid_grant",
					})
					.where(eq(integrationConnections.id, connectionId));
				return { disconnected: true };
			}
			throw new Error(
				`Google token refresh failed: ${response.status} ${response.statusText}`,
			);
		}

		const data = googleTokenResponseSchema.parse(await response.json());
		const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

		await tx
			.update(integrationConnections)
			.set({
				accessToken: data.access_token,
				refreshToken: data.refresh_token ?? connection.refreshToken,
				tokenExpiresAt,
				disconnectedAt: null,
				disconnectReason: null,
			})
			.where(eq(integrationConnections.id, connectionId));

		return { disconnected: false, accessToken: data.access_token };
	});
}

/** A token good for at least the refresh buffer, or null if disconnected. */
export async function getGoogleAccessToken(
	connectionId: string,
): Promise<string | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: eq(integrationConnections.id, connectionId),
		columns: {
			accessToken: true,
			refreshToken: true,
			tokenExpiresAt: true,
			disconnectedAt: true,
		},
	});
	if (!connection || connection.disconnectedAt) return null;

	const expiresSoon =
		!connection.tokenExpiresAt ||
		connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
	if (!expiresSoon) return connection.accessToken;

	if (!connection.refreshToken) {
		await db
			.update(integrationConnections)
			.set({ disconnectedAt: new Date(), disconnectReason: "no_refresh_token" })
			.where(eq(integrationConnections.id, connectionId));
		return null;
	}
	const result = await refreshGoogleToken(connectionId);
	return result.disconnected ? null : result.accessToken;
}

/**
 * One authenticated call against a Google API. A 401 is retried once after a
 * forced refresh; anything else non-2xx throws a `GoogleApiError` carrying the
 * status so callers can treat 404/410 as the protocol signals they are.
 */
export async function googleFetch<T>(
	connectionId: string,
	url: string,
	init: RequestInit = {},
): Promise<T> {
	const token = await getGoogleAccessToken(connectionId);
	if (!token) throw new GoogleApiError(401, url, "connection disconnected");

	let response = await send(url, init, token);
	if (response.status === 401) {
		const refreshed = await refreshGoogleToken(connectionId, { force: true });
		if (refreshed.disconnected) {
			throw new GoogleApiError(401, url, "connection disconnected");
		}
		response = await send(url, init, refreshed.accessToken);
	}
	if (!response.ok) {
		throw new GoogleApiError(response.status, url, await response.text());
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

async function send(
	url: string,
	init: RequestInit,
	token: string,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), GOOGLE_API_TIMEOUT_MS);
	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
			headers: {
				...(init.headers as Record<string, string> | undefined),
				Authorization: `Bearer ${token}`,
				...(init.body ? { "Content-Type": "application/json" } : {}),
			},
		});
	} finally {
		clearTimeout(timeout);
	}
}
