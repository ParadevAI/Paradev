import { waitUntil } from "@vercel/functions";
import { allOrgMemberIds } from "../channel/members";
import { publishToUsers } from "../channel/publish";

/** Best effort and after the response: a lost event only leaves a view stale until its next refetch. */
export function announceAgentChanged(agent: {
	id: string;
	organizationId: string;
}) {
	waitUntil(
		allOrgMemberIds(agent.organizationId).then(
			(userIds) =>
				publishToUsers(userIds, {
					type: "agents.changed",
					organizationId: agent.organizationId,
					agentId: agent.id,
				}),
			(error) => console.warn("[agents] couldn't announce a change:", error),
		),
	);
}
