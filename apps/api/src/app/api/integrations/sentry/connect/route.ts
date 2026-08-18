import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

/** How the callback recovers which Superset org started the install. */
export const SENTRY_STATE_COOKIE = "sentry_oauth_state";

/**
 * Starts a Sentry install for the org's Sentry admin.
 *
 * A public Sentry integration is installed from Sentry's side, and Sentry
 * redirects back to the app's one fixed Redirect URL with only a grant code and
 * an install id — no state of ours. Sentry's install payload never names the
 * Superset org either. So the one place the Superset org is known is right here,
 * and it is carried to the callback in a signed, first-party cookie rather than
 * through Sentry.
 */
export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const organizationId = new URL(request.url).searchParams.get(
		"organizationId",
	);
	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
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

	if (!env.SENTRY_APP_SLUG || !env.SENTRY_CLIENT_ID) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry?error=not_configured`,
		);
	}

	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const installUrl = `https://sentry.io/sentry-apps/${env.SENTRY_APP_SLUG}/external-install/`;

	const secure = env.NEXT_PUBLIC_API_URL.startsWith("https") ? " Secure;" : "";
	return new Response(null, {
		status: 302,
		headers: {
			Location: installUrl,
			// Scoped to the callback's path so it is sent on the top-level GET
			// redirect back and nowhere else; short-lived, like the state's TTL.
			"Set-Cookie": `${SENTRY_STATE_COOKIE}=${state}; HttpOnly;${secure} SameSite=Lax; Path=/api/integrations/sentry; Max-Age=600`,
		},
	});
}
