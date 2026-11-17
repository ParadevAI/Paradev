import { db } from "@superset/db/client";
import { agents, type SelectAgent } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { isOrgAdmin } from "../channel/access";

export const agentNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Agent not found",
		i18nKey: "serverError.agent.notFound",
	});

export interface AgentAccess {
	agent: SelectAgent;
	canManage: boolean;
}

/** A live agent in one of the caller's organizations; anything else reads as not found. */
export async function loadAgentAccess(
	userId: string,
	agentId: string,
): Promise<AgentAccess> {
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
	return {
		agent,
		canManage: agent.createdByUserId === userId || isOrgAdmin(membership.role),
	};
}

/** The subset of `agentIds` that are live Devs in the organization. */
export async function orgDevIds(
	organizationId: string,
	agentIds: readonly string[],
): Promise<string[]> {
	if (agentIds.length === 0) return [];
	const rows = await db
		.select({ id: agents.id })
		.from(agents)
		.where(
			and(
				inArray(agents.id, [...agentIds]),
				eq(agents.organizationId, organizationId),
				isNull(agents.archivedAt),
			),
		);
	return rows.map((row) => row.id);
}

/** Its creator or an org admin may change an agent. */
export async function loadManagedAgent(
	userId: string,
	agentId: string,
): Promise<SelectAgent> {
	const { agent, canManage } = await loadAgentAccess(userId, agentId);
	if (!canManage) {
		throw userError({
			code: "FORBIDDEN",
			message:
				"Only its creator or an organization admin can change this agent",
			i18nKey: "serverError.agent.adminRequired",
		});
	}
	return agent;
}
