import { db } from "@superset/db/client";
import { integrationConnections, type SentryConfig } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";

/**
 * The public Sentry integration's REST surface, as far as this provider needs
 * it: exchange/refresh an installation's token, verify an install, and list a
 * region's projects.
 *
 * sentry.io is the control silo (organizations, app-installation
 * authorizations); anything scoped to one organization — its projects — must
 * go to that organization's region URL.
 */
export const SENTRY_URL = "https://sentry.io";

/** Refresh a token this many ms before it actually expires. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type SentryProject = { id: string; slug: string; name: string };

export type SentryOrganization = {
	slug: string;
	name: string;
	regionUrl: string;
};

/**
 * The single organization an installation's token belongs to, with its region
 * URL. A public-app token is scoped to one org, so `/organizations/` returns
 * exactly the one this install is for — which is how the org slug is learned
 * from the callback, whose query params carry only the code and install id.
 */
export async function fetchSentryOrganization(
	token: string,
): Promise<SentryOrganization | null> {
	const response = await fetch(`${SENTRY_URL}/api/0/organizations/`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok) return null;
	const orgs = (await response.json()) as Array<{
		slug: string;
		name: string;
		links?: { regionUrl?: string };
	}>;
	const [org] = orgs;
	if (!org) return null;
	return {
		slug: org.slug,
		name: org.name,
		regionUrl: org.links?.regionUrl ?? SENTRY_URL,
	};
}

/**
 * The token grant Sentry returns from both the authorization-code exchange and
 * a refresh. Note the camelCase and `expiresAt` (an ISO date), unlike the
 * snake_case `expires_in` of most OAuth providers.
 */
export const sentryTokenResponseSchema = z.object({
	token: z.string(),
	refreshToken: z.string(),
	expiresAt: z.string(),
});
export type SentryTokenResponse = z.infer<typeof sentryTokenResponseSchema>;

function authorizationsUrl(installationUuid: string): string {
	return `${SENTRY_URL}/api/0/sentry-app-installations/${installationUuid}/authorizations/`;
}

/** Exchange the install's grant code for the first token pair. */
export async function exchangeSentryCode(params: {
	installationUuid: string;
	code: string;
}): Promise<SentryTokenResponse> {
	if (!env.SENTRY_CLIENT_ID || !env.SENTRY_CLIENT_SECRET) {
		throw new Error("Sentry app is not configured");
	}
	const response = await fetch(authorizationsUrl(params.installationUuid), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: params.code,
			client_id: env.SENTRY_CLIENT_ID,
			client_secret: env.SENTRY_CLIENT_SECRET,
		}),
	});
	if (!response.ok) {
		throw new Error(`Sentry code exchange failed: ${response.status}`);
	}
	return sentryTokenResponseSchema.parse(await response.json());
}

/** Mark an install "installed" — required when the app has Verify Install on. */
export async function verifySentryInstall(
	installationUuid: string,
	token: string,
) {
	await fetch(
		`${SENTRY_URL}/api/0/sentry-app-installations/${installationUuid}/`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ status: "installed" }),
		},
	).catch(() => {
		// Verify Install is best-effort: the token already works, and a failure
		// here only leaves the install in "pending" on Sentry's side.
	});
}

type TokenResult =
	| { disconnected: true }
	| { disconnected: false; accessToken: string };

/**
 * A usable access token for a connection, refreshing it first when it is within
 * the buffer of expiry. Public-app tokens live ~8h, so anything cached longer
 * than a session needs this. Serialized per connection so two callers do not
 * both burn the one-time refresh token.
 */
export async function getSentryAccessToken(
	connectionId: string,
): Promise<TokenResult> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				refreshToken: integrationConnections.refreshToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				disconnectedAt: integrationConnections.disconnectedAt,
				config: integrationConnections.config,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);

		if (!connection || connection.disconnectedAt) return { disconnected: true };
		if (
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
		) {
			return { disconnected: false, accessToken: connection.accessToken };
		}
		if (!connection.refreshToken || !env.SENTRY_CLIENT_ID) {
			return { disconnected: false, accessToken: connection.accessToken };
		}

		// The install uuid is the token endpoint's path segment; without it there
		// is nothing to refresh against, so the current token is all there is.
		const installationUuid = (connection.config as SentryConfig | null)
			?.installationUuid;
		if (!installationUuid) {
			return { disconnected: false, accessToken: connection.accessToken };
		}

		const response = await fetch(authorizationsUrl(installationUuid), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "refresh_token",
				refresh_token: connection.refreshToken,
				client_id: env.SENTRY_CLIENT_ID,
				client_secret: env.SENTRY_CLIENT_SECRET,
			}),
		});
		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				await tx
					.update(integrationConnections)
					.set({
						disconnectedAt: new Date(),
						disconnectReason: "invalid_grant",
					})
					.where(eq(integrationConnections.id, connectionId));
				return { disconnected: true };
			}
			throw new Error(`Sentry token refresh failed: ${response.status}`);
		}
		const data = sentryTokenResponseSchema.parse(await response.json());
		await tx
			.update(integrationConnections)
			.set({
				accessToken: data.token,
				refreshToken: data.refreshToken,
				tokenExpiresAt: new Date(data.expiresAt),
			})
			.where(eq(integrationConnections.id, connectionId));
		return { disconnected: false, accessToken: data.token };
	});
}

const MAX_PAGES = 10;

/** `Link: <url>; rel="next"; results="true"` is Sentry's next-page cursor. */
function nextLink(response: Response): string | null {
	const header = response.headers.get("link");
	if (!header) return null;
	for (const part of header.split(",")) {
		if (part.includes('rel="next"') && part.includes('results="true"')) {
			return part.match(/<([^>]+)>/)?.[1] ?? null;
		}
	}
	return null;
}

/** Every project in the org, following pagination. */
export async function fetchSentryProjects(
	regionUrl: string,
	organizationSlug: string,
	token: string,
): Promise<SentryProject[]> {
	const items: SentryProject[] = [];
	let cursor: string | null =
		`${regionUrl}/api/0/organizations/${encodeURIComponent(
			organizationSlug,
		)}/projects/`;
	for (let page = 0; cursor && page < MAX_PAGES; page++) {
		const response: Response = await fetch(cursor, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (response.status === 401 || response.status === 403) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Sentry rejected the token",
			});
		}
		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: `Sentry returned ${response.status}`,
			});
		}
		items.push(...((await response.json()) as SentryProject[]));
		cursor = nextLink(response);
	}
	return items;
}

/** Mark a connection disconnected and drop its tokens. */
export async function disconnectSentry(
	connectionId: string,
	reason: string,
): Promise<void> {
	await db
		.update(integrationConnections)
		.set({
			disconnectedAt: new Date(),
			disconnectReason: reason,
			accessToken: "",
			refreshToken: null,
		})
		.where(eq(integrationConnections.id, connectionId));
}
