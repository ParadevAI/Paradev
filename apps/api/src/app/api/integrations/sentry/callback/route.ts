import { db } from "@superset/db/client";
import {
	integrationConnections,
	members,
	type SentryConfig,
} from "@superset/db/schema";
import {
	exchangeSentryCode,
	fetchSentryOrganization,
	verifySentryInstall,
} from "@superset/trpc/integrations/sentry";
import { and, eq, sql } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";
import { SENTRY_STATE_COOKIE } from "../connect/route";

const web = (params: string) =>
	Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry${params}`);

/**
 * Finishes a Sentry install: exchanges the grant code for a token pair and
 * writes the connection.
 *
 * This is the authoritative path — it is the only one that knows the Superset
 * org (from the signed cookie the connect route set). The `installation.created`
 * webhook that Sentry fires in parallel names no Superset org, so it can only
 * ever update a row this route already wrote; the two never both create.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const installationId = url.searchParams.get("installationId");
	const error = url.searchParams.get("error");

	if (error) return web("?error=oauth_denied");
	if (!code || !installationId) return web("?error=missing_params");

	const stateCookie = readCookie(
		request.headers.get("cookie"),
		SENTRY_STATE_COOKIE,
	);
	const stateData = stateCookie ? verifySignedState(stateCookie) : null;
	if (!stateData) return web("?error=invalid_state");
	const { organizationId, userId } = stateData;

	// Re-verify membership at callback time (the cookie was signed earlier).
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
	if (!membership) return web("?error=unauthorized");

	let token: Awaited<ReturnType<typeof exchangeSentryCode>>;
	try {
		token = await exchangeSentryCode({
			installationUuid: installationId,
			code,
		});
	} catch (e) {
		console.error("[sentry/callback] Token exchange failed:", e);
		return web("?error=token_exchange_failed");
	}

	const organization = await fetchSentryOrganization(token.token);
	if (!organization) return web("?error=organization_lookup_failed");

	const config: SentryConfig = {
		provider: "sentry",
		installationUuid: installationId,
		regionUrl: organization.regionUrl,
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "sentry",
			accessToken: token.token,
			refreshToken: token.refreshToken,
			tokenExpiresAt: new Date(token.expiresAt),
			externalOrgId: organization.slug,
			externalOrgName: organization.name,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			// The org-scoped uniqueness is a partial index (Google connections are
			// per user); Postgres only infers it when the predicate is named.
			targetWhere: sql`${integrationConnections.provider} <> 'google'`,
			set: {
				accessToken: token.token,
				refreshToken: token.refreshToken,
				tokenExpiresAt: new Date(token.expiresAt),
				externalOrgId: organization.slug,
				externalOrgName: organization.name,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	// Verify Install, if the app has it on; best-effort, the token already works.
	await verifySentryInstall(installationId, token.token);

	// Clear the one-shot state cookie on the way back.
	return new Response(null, {
		status: 302,
		headers: {
			Location: `${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry`,
			"Set-Cookie": `${SENTRY_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/integrations/sentry; Max-Age=0`,
		},
	});
}

/** One cookie value from a request's Cookie header. */
function readCookie(header: string | null, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return null;
}
