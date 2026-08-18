import { db } from "@superset/db/client";
import { members, userIdentities } from "@superset/db/schema";
import { microsoftCredentials } from "@superset/trpc/integrations/microsoft-teams";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

import { IDENTITY_REDIRECT_URI, IDENTITY_SCOPES } from "../identityFlow";

const SETTINGS_URL = `${env.NEXT_PUBLIC_WEB_URL}/integrations/microsoft-teams`;

function back(error?: string): Response {
	const url = new URL(SETTINGS_URL);
	if (error) url.searchParams.set("error", error);
	return Response.redirect(url.toString());
}

const idTokenClaims = z.object({
	aud: z.string(),
	oid: z.string().min(1),
	tid: z.string().min(1),
	name: z.string().optional(),
	preferred_username: z.string().optional(),
});

/**
 * The second leg of connecting Teams: who the consenting admin is.
 *
 * Admin consent identifies a tenant, not a person, and `me` on a Teams
 * trigger needs the person's Entra object id. So after consent the admin is
 * sent through a plain OpenID sign-in, and the id token's `oid` is linked to
 * their Superset user. The connection is already saved by the time this runs:
 * declining here costs only "Me", not the integration.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const state = url.searchParams.get("state");
	const code = url.searchParams.get("code");
	if (url.searchParams.get("error")) return back("identity_denied");
	if (!state || !code) return back("missing_params");

	const stateData = verifySignedState(state);
	if (!stateData) return back("invalid_state");
	const { organizationId, userId } = stateData;

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
	if (!membership) return back("unauthorized");

	const { clientId, clientSecret } = microsoftCredentials();
	const response = await fetch(
		"https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: "authorization_code",
				code,
				redirect_uri: IDENTITY_REDIRECT_URI,
				scope: IDENTITY_SCOPES,
			}),
		},
	);
	const body: unknown = await response.json().catch(() => null);
	const idToken =
		typeof body === "object" && body !== null && "id_token" in body
			? (body as { id_token?: unknown }).id_token
			: undefined;
	if (!response.ok || typeof idToken !== "string") {
		console.error("[microsoft-teams/identity] token exchange failed:", body);
		return back("identity_failed");
	}

	// Straight from the token endpoint over TLS with our client secret, so
	// the payload is trusted the same way the access token is; only the
	// audience is checked, so a token minted for another app cannot link.
	const claims = idTokenClaims.safeParse(decodeJwtPayload(idToken));
	if (!claims.success || claims.data.aud !== clientId) {
		console.error("[microsoft-teams/identity] unexpected id token claims");
		return back("identity_failed");
	}

	await db
		.insert(userIdentities)
		.values({
			provider: "microsoft_teams",
			externalId: claims.data.oid,
			// Entra object ids are only meaningful within their tenant.
			externalScopeId: claims.data.tid,
			userId,
			organizationId,
			handle: claims.data.preferred_username ?? null,
			displayName: claims.data.name ?? null,
		})
		// Re-linking claims the Entra account for whoever linked it last.
		.onConflictDoUpdate({
			target: [
				userIdentities.organizationId,
				userIdentities.provider,
				userIdentities.externalScopeId,
				userIdentities.externalId,
			],
			set: {
				userId,
				handle: claims.data.preferred_username ?? null,
				displayName: claims.data.name ?? null,
			},
		});

	return back();
}

function decodeJwtPayload(token: string): unknown {
	const payload = token.split(".")[1];
	if (!payload) return null;
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}
