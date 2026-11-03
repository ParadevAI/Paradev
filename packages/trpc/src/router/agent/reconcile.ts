import { sessionWorkflowId, stateQuery } from "@superset/agent-harness/session";
import { db } from "@superset/db/client";
import { agents, agentTurns } from "@superset/db/schema";
import type { Client } from "@temporalio/client";
import { and, eq, sql } from "drizzle-orm";
import { posthog } from "../../lib/analytics";
import { afterTaskTurn } from "./tasks";
import { redeliverMessage, startTurnsForMessage } from "./turns";

/** A message younger than this may still be on its way; one older is given up on. */
const DELIVERY_GRACE = "1 minute";
const DELIVERY_WINDOW = "1 hour";
/** A running turn the workflow has not been asked about for this long. */
const TURN_GRACE = "2 minutes";
/** Failed workflow tasks in a row before a session workflow counts as wedged. */
const WEDGED_ATTEMPTS = 3;
const BATCH = 50;

export type ReconcileFix = "redelivered" | "terminated" | "lost";

export interface ReconcileReport {
	redelivered: number;
	terminated: number;
	lost: number;
}

/**
 * Repairs the Dev states that drop a message without anyone being told, and
 * counts each repair so a kind that stops happening is known to be fixed:
 * a DM or mention that never became a turn is sent again; a session
 * workflow whose workflow task keeps failing is terminated; and a turn the
 * database says is running but its workflow is not is settled as lost, its
 * messages are sent again if it is recent, and a task's parent hears about it.
 */
export async function reconcileDevs(
	temporal: Client,
	{ organizationId }: { organizationId?: string } = {},
): Promise<ReconcileReport> {
	const report: ReconcileReport = { redelivered: 0, terminated: 0, lost: 0 };
	const count = (fix: ReconcileFix, details: Record<string, unknown>) => {
		report[fix] += 1;
		console.info("[devs-reconcile]", fix, JSON.stringify(details));
		posthog.capture({
			distinctId: "devs-reconciler",
			event: "dev_reconciler_fixed",
			properties: { fix, ...details },
		});
	};

	for (const message of await undeliveredMessages(organizationId)) {
		await startTurnsForMessage(
			{ id: message.channelId, kind: message.channelKind },
			message,
			message.authorId,
		);
		count("redelivered", { messageId: message.id });
	}

	for (const turn of await staleRunningTurns(organizationId)) {
		const workflow = temporal.workflow.getHandle(
			sessionWorkflowId(turn.sessionId),
		);
		const state = await workflowState(workflow, turn.id);
		if (state === "wedged") {
			await workflow.terminate("devs-reconcile: workflow task keeps failing");
			count("terminated", { sessionId: turn.sessionId });
		}
		if (state === "healthy") continue;
		if (await settleLost(turn.id)) {
			if (turn.recent) await sendAgain(turn);
			await afterTaskTurn(turn.id);
			count("lost", { turnId: turn.id, sessionId: turn.sessionId });
		}
	}
	return report;
}

async function undeliveredMessages(organizationId: string | undefined) {
	const { rows } = await db.execute<{
		id: string;
		channelId: string;
		channelKind: "channel" | "dm";
		body: string;
		threadRootId: string | null;
		mentionedIds: string[];
		authorId: string;
	}>(sql`
		select distinct m.id, m.channel_id as "channelId", c.kind as "channelKind", m.body,
			m.thread_root_id as "threadRootId", m.mentioned_ids as "mentionedIds",
			m.author_id as "authorId", m.created_at
		from channel_messages m
		join channels c on c.id = m.channel_id and c.archived_at is null
		join auth.users u on u.id = m.author_id
		join channel_members cm on cm.channel_id = m.channel_id
		join agents a on a.id = cm.actor_id and a.archived_at is null and a.paused_at is null
		where m.created_at between now() - ${DELIVERY_WINDOW}::interval and now() - ${DELIVERY_GRACE}::interval
			and m.deleted_at is null and m.subtype is null
			and (c.kind = 'dm' or a.id = any(m.mentioned_ids))
			${organizationId ? sql`and c.organization_id = ${organizationId}` : sql``}
			and not exists (
				select 1 from agent_turns t
				where t.agent_id = a.id
					and (t.prompt_id = m.id::text or m.id::text = any(t.steer_prompt_ids))
			)
		order by m.created_at
		limit ${BATCH}`);
	return rows;
}

function staleRunningTurns(organizationId: string | undefined) {
	return db
		.select({
			id: agentTurns.id,
			sessionId: agentTurns.sessionId,
			agentId: agentTurns.agentId,
			reason: agentTurns.reason,
			promptId: agentTurns.promptId,
			steerPromptIds: agentTurns.steerPromptIds,
			recent: sql<boolean>`${agentTurns.startedAt} > now() - ${DELIVERY_WINDOW}::interval`,
		})
		.from(agentTurns)
		.where(
			and(
				eq(agentTurns.status, "running"),
				organizationId
					? eq(agentTurns.organizationId, organizationId)
					: undefined,
				sql`${agentTurns.startedAt} < now() - ${TURN_GRACE}::interval`,
			),
		)
		.limit(BATCH);
}

type StaleTurn = Awaited<ReturnType<typeof staleRunningTurns>>[number];
type Workflow = ReturnType<Client["workflow"]["getHandle"]>;

/** Healthy when the workflow is running this turn or may still start it. */
async function workflowState(
	workflow: Workflow,
	turnId: string,
): Promise<"healthy" | "wedged" | "lost"> {
	const description = await workflow.describe().catch(() => null);
	if (description?.status.name !== "RUNNING") return "lost";
	const attempt = description.raw.pendingWorkflowTask?.attempt ?? 0;
	if (attempt >= WEDGED_ATTEMPTS) return "wedged";
	const state = await workflow.query(stateQuery).catch(() => null);
	if (!state) return "healthy";
	if (state.turnId === turnId || state.pendingTurns > 0) return "healthy";
	return "lost";
}

async function settleLost(turnId: string): Promise<boolean> {
	const [settled] = await db
		.update(agentTurns)
		.set({ status: "failed", errorCode: "lost", settledAt: new Date() })
		.where(and(eq(agentTurns.id, turnId), eq(agentTurns.status, "running")))
		.returning({ id: agentTurns.id });
	return Boolean(settled);
}

/** Each channel message the lost turn was answering goes to the main session again. */
async function sendAgain(turn: StaleTurn) {
	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, turn.agentId))
		.limit(1);
	if (!agent) return;
	const promptIds = [turn.promptId, ...turn.steerPromptIds].filter(
		(id): id is string => Boolean(id && UUID.test(id)),
	);
	for (const messageId of promptIds) {
		await redeliverMessage({
			agent,
			messageId,
			promptId: `again:${messageId}`,
			reason: turn.reason,
		});
	}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
