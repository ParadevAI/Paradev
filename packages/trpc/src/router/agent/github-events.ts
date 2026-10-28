import { db } from "@superset/db/client";
import { agentSessions, agents } from "@superset/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { eventText, submitPrompt } from "./turns";

/**
 * Tells a Dev's main session about something that happened on a pull request
 * one of its tasks opened. Nothing happens for other pull requests. The
 * delivery id makes a redelivered webhook a no-op.
 */
export async function notifyDevOfPullRequest({
	url,
	deliveryId,
	what,
}: {
	url: string;
	deliveryId: string;
	what: string;
}): Promise<void> {
	const [task] = await db
		.select({ task: agentSessions, agent: agents })
		.from(agentSessions)
		.innerJoin(agents, eq(agents.id, agentSessions.agentId))
		.where(
			and(
				eq(agentSessions.pullRequestUrl, url),
				isNull(agents.archivedAt),
				isNull(agents.pausedAt),
			),
		)
		.orderBy(desc(agentSessions.createdAt))
		.limit(1);
	if (!task?.task.parentSessionId) return;
	await submitPrompt({
		agent: task.agent,
		sessionId: task.task.parentSessionId,
		actingUserId: null,
		promptId: `github:${deliveryId}`,
		text: eventText({
			from: "GitHub",
			where: `the pull request of your task ${task.task.id} ("${task.task.title ?? ""}")`,
			replyTo: null,
			body: `${url}\n${what}`,
		}),
		reason: "github",
	});
}
