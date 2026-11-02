import { auth, mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { teamMembers, teams } from "@superset/db/schema/auth";
import { findOrgMembership } from "@superset/db/utils";
import { ORGANIZATION_TOKEN_HEADER } from "@superset/shared/constants";
import { and, eq } from "drizzle-orm";
import { sessionFromOAuthBearer } from "@/trpc/context";

const TOKEN_TTL_SECONDS = 60 * 60;
const CLI_CLIENT_ID = "superset-cli";

function reply(body: unknown, status: number): Response {
	return Response.json(body, {
		status,
		headers: { [ORGANIZATION_TOKEN_HEADER]: "1" },
	});
}

function unverifiedClaims(token: string): Record<string, unknown> | null {
	const payload = token.split(".")[1];
	if (!payload) return null;
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

/**
 * Who may mint: a session, an API key, or a CLI OAuth login. Any other JWT,
 * scoped, short-lived or already bound, can't be turned into a new token.
 */
async function minter(headers: Headers) {
	const session = await auth.api.getSession({ headers });
	if (session) return session;
	const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!bearer || unverifiedClaims(bearer)?.azp !== CLI_CLIENT_ID) return null;
	return sessionFromOAuthBearer(headers);
}

/** A token for one organization the caller belongs to. */
export async function organizationToken(
	req: Request,
	organizationId: string,
): Promise<Response> {
	const session = await minter(req.headers);
	if (!session) return reply({ error: "unauthorized" }, 401);
	const user = session.user as typeof session.user & {
		deletionRequestedAt?: Date | null;
	};
	if (user.deletionRequestedAt) {
		return reply({ error: "Account is pending deletion." }, 403);
	}
	if (!(await findOrgMembership({ userId: user.id, organizationId }))) {
		return reply(
			{ error: `Not a member of organization ${organizationId}` },
			403,
		);
	}
	const teamRows = await db
		.select({ id: teams.id })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, user.id),
				eq(teams.organizationId, organizationId),
			),
		);
	const token = await mintUserJwt({
		userId: user.id,
		organizationId,
		name: user.name ?? null,
		image: user.image ?? null,
		teamIds: teamRows.map((team) => team.id),
		ttlSeconds: TOKEN_TTL_SECONDS,
	});
	return reply({ token }, 200);
}
