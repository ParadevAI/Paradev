import { db } from "@superset/db/client";
import { agents, type SelectAgent } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { and, eq, isNull } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { isOrgAdmin } from "../channel/access";

export const agentNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Agent not found",
		i18nKey: "serverError.agent.notFound",
	});

export async function assertOrgAdmin(userId: string, organizationId: string) {
	const membership = await findOrgMembership({ userId, organizationId });
	if (!membership || !isOrgAdmin(membership.role)) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only organization admins can manage agents",
			i18nKey: "serverError.agent.adminRequired",
		});
	}
}

/** A live agent in an org the caller administers; anything else reads as not found. */
export async function loadManagedAgent(
	userId: string,
	agentId: string,
): Promise<SelectAgent> {
	const [agent] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, agentId), isNull(agents.archivedAt)))
		.limit(1);
	if (!agent) throw agentNotFound();
	const membership = await findOrgMembership({
		userId,
		organizationId: agent.organizationId,
	});
	if (!membership) throw agentNotFound();
	await assertOrgAdmin(userId, agent.organizationId);
	return agent;
}
