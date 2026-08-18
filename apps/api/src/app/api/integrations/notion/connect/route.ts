import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

export async function GET(request: Request) {
	if (!env.NOTION_CLIENT_ID) {
		return Response.json(
			{ error: "Notion integration is not configured" },
			{ status: 503 },
		);
	}

	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");
	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
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

	const notionAuthUrl = new URL("https://api.notion.com/v1/oauth/authorize");
	notionAuthUrl.searchParams.set("client_id", env.NOTION_CLIENT_ID);
	notionAuthUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_API_URL}/api/integrations/notion/callback`,
	);
	notionAuthUrl.searchParams.set("response_type", "code");
	// The only value Notion accepts; a workspace is authorized by one of its
	// members, whose identity comes back as `owner`.
	notionAuthUrl.searchParams.set("owner", "user");
	notionAuthUrl.searchParams.set("state", state);

	return Response.redirect(notionAuthUrl.toString());
}
