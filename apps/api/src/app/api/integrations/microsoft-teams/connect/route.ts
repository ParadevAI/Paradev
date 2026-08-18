import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

/**
 * Starts the Teams connection: an Entra admin-consent flow, not a user
 * sign-in. Everything the provider reads (channel messages, channels, teams)
 * is an application permission, which only a tenant admin can grant and which
 * grants the app the whole tenant at once. Delegated permissions are not
 * supported for tenant-wide message notifications.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");
	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
	}

	if (!env.MICROSOFT_CLIENT_ID) {
		return Response.json(
			{ error: "Microsoft Teams integration is not configured" },
			{ status: 503 },
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	const state = createSignedState({ organizationId, userId: session.user.id });

	// `organizations`, not `common`: personal accounts cannot grant admin
	// consent, and Microsoft's own guidance says not to use common here.
	const consentUrl = new URL(
		"https://login.microsoftonline.com/organizations/v2.0/adminconsent",
	);
	consentUrl.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
	// `.default` requests every application permission the app registration
	// declares — the only way to request app permissions on this endpoint.
	consentUrl.searchParams.set("scope", "https://graph.microsoft.com/.default");
	consentUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_API_URL}/api/integrations/microsoft-teams/callback`,
	);
	consentUrl.searchParams.set("state", state);

	return Response.redirect(consentUrl.toString());
}
