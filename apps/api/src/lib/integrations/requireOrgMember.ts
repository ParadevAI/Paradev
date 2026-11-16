import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";
import {
	OWN_ROOT_DOMAINS,
	withOwnDomainTwins,
} from "@superset/shared/own-domains";
import { env } from "@/env";

export type OrgMember = {
	organizationId: string;
	userId: string;
	role: string;
};

function ownRootOf(hostname: string): string | undefined {
	return OWN_ROOT_DOMAINS.find(
		(root) => hostname === root || hostname.endsWith(`.${root}`),
	);
}

/** The session cookie is scoped to one root domain, so sign in on the request's. */
function signInUrl(request: Request): URL {
	const root = ownRootOf(new URL(request.url).hostname);
	const web =
		withOwnDomainTwins([env.NEXT_PUBLIC_WEB_URL]).find(
			(url) => ownRootOf(new URL(url).hostname) === root,
		) ?? env.NEXT_PUBLIC_WEB_URL;
	const signIn = new URL("/sign-in", web);
	signIn.searchParams.set("redirect", request.url);
	return signIn;
}

/**
 * The connect-route preamble: who is asking, for which organization, and
 * whether they belong to it. Returns the response to send when a check fails:
 * a sign-in redirect that comes back here, or an error.
 *
 * It deliberately hands back no state token: a state is only ever minted by
 * `beginOAuthFlow`, which binds it to the asking browser in the same step.
 */
export async function requireOrgMember(
	request: Request,
): Promise<OrgMember | Response> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.redirect(signInUrl(request).toString(), 302);
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

	return { organizationId, userId: session.user.id, role: membership.role };
}
