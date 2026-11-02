import { auth, mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { teamMembers, teams } from "@superset/db/schema/auth";
import { findOrgMembership } from "@superset/db/utils";
import { and, eq } from "drizzle-orm";
import { sessionFromOAuthBearer } from "@/trpc/context";

const TOKEN_TTL_SECONDS = 60 * 60;

/**
 * A token for one organization the caller belongs to. A token already bound
 * to an organization renews only for that one, so it can never be turned into
 * another organization's token.
 */
export async function organizationToken(
	req: Request,
	organizationId: string,
): Promise<Response> {
	const session =
		(await auth.api.getSession({ headers: req.headers })) ??
		(await sessionFromOAuthBearer(req.headers));
	if (!session) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const bound = (session.session as { boundOrganizationId?: string | null })
		.boundOrganizationId;
	const userId = session.user.id;
	if (
		(bound && bound !== organizationId) ||
		!(await findOrgMembership({ userId, organizationId }))
	) {
		return Response.json(
			{ error: `Not a member of organization ${organizationId}` },
			{ status: 403 },
		);
	}
	const teamRows = await db
		.select({ id: teams.id })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, userId),
				eq(teams.organizationId, organizationId),
			),
		);
	const token = await mintUserJwt({
		userId,
		organizationId,
		name: session.user.name ?? null,
		image: session.user.image ?? null,
		teamIds: teamRows.map((team) => team.id),
		ttlSeconds: TOKEN_TTL_SECONDS,
	});
	return Response.json({ token });
}
