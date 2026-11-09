import { db, dbWs } from "@superset/db/client";
import {
	CHAT_MOVE_IN_FLIGHT,
	chatMoves,
	WORKSPACE_MOVE_IN_FLIGHT,
	workspaceMoves,
} from "@superset/db/schema";
import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** Longer than a move job may run, so a move this quiet has stopped. */
export const STALE_MOVE_MS = 6 * 60 * 1000;

export function staleBefore(now = new Date()): Date {
	return new Date(now.getTime() - STALE_MOVE_MS);
}

/**
 * Brings a workspace move's status in line with its chats, each counted by
 * its newest attempt: `moving` while any is still moving, then `ready`,
 * `failed` (with the first chat's error), or `partial` for a mix. A move with
 * no chats is left to whoever starts its destination. The parent row is
 * locked first, so two chats finishing at once cannot settle it from an old
 * view of each other.
 */
export async function settleWorkspaceMove(
	workspaceMoveId: string,
	tx?: Transaction,
): Promise<void> {
	if (!tx) {
		await dbWs.transaction((own) => settleWorkspaceMove(workspaceMoveId, own));
		return;
	}
	await tx
		.select({ id: workspaceMoves.id })
		.from(workspaceMoves)
		.where(eq(workspaceMoves.id, workspaceMoveId))
		.for("update");
	await tx.execute(sql`
		with newest as (
			select distinct on (session_id) status, error
			from chat_moves
			where workspace_move_id = ${workspaceMoveId}
			order by session_id, created_at desc
		), summary as (
			select
				count(*) as total,
				count(*) filter (where status in ('pending', 'copying', 'restoring')) as moving,
				count(*) filter (where status = 'ready') as ready,
				count(*) filter (where status = 'failed') as failed,
				(select error from newest where status = 'failed' limit 1) as first_error
			from newest
		)
		update workspace_moves
		set
			status = (case
				when summary.moving > 0 then 'moving'
				when summary.ready = summary.total then 'ready'
				when summary.failed = summary.total then 'failed'
				else 'partial'
			end)::workspace_move_status,
			error = case
				when summary.moving = 0 and summary.failed = summary.total
					then summary.first_error
				else null
			end,
			finished_at = case when summary.moving > 0 then null else now() end,
			updated_at = now()
		from summary
		where workspace_moves.id = ${workspaceMoveId} and summary.total > 0
	`);
}

/** Settles each workspace move the given chat moves belong to. */
export async function settleWorkspaceMoves(
	workspaceMoveIds: Iterable<string>,
): Promise<void> {
	for (const id of new Set(workspaceMoveIds)) await settleWorkspaceMove(id);
}

/**
 * Fails a chat's moves that stopped changing state, so the chat can move
 * again. One still waiting its turn counts as stopped only once its whole
 * workspace move has, since the chats of a move to a computer run one after
 * another.
 */
export async function failStaleMoves(sessionId: string): Promise<void> {
	const stale = staleBefore();
	const failed = await db
		.update(chatMoves)
		.set({
			status: "failed",
			error: "The move stopped answering",
			finishedAt: new Date(),
		})
		.where(
			and(
				eq(chatMoves.sessionId, sessionId),
				inArray(chatMoves.status, CHAT_MOVE_IN_FLIGHT),
				lt(chatMoves.updatedAt, stale),
				or(
					ne(chatMoves.status, "pending"),
					inArray(
						chatMoves.workspaceMoveId,
						db
							.select({ id: workspaceMoves.id })
							.from(workspaceMoves)
							.where(lt(workspaceMoves.updatedAt, stale)),
					),
				),
			),
		)
		.returning({ workspaceMoveId: chatMoves.workspaceMoveId });
	await settleWorkspaceMoves(failed.map((row) => row.workspaceMoveId));
}

/**
 * Fails a workspace's moves that stopped changing state, with their quiet
 * chats, so a move that never got going does not keep the workspace from
 * moving again.
 */
export async function failStaleWorkspaceMoves(
	organizationId: string,
	fromWorkspaceId: string,
): Promise<void> {
	const stale = staleBefore();
	const quiet = await db
		.select({ id: workspaceMoves.id })
		.from(workspaceMoves)
		.where(
			and(
				eq(workspaceMoves.organizationId, organizationId),
				eq(workspaceMoves.fromWorkspaceId, fromWorkspaceId),
				inArray(workspaceMoves.status, WORKSPACE_MOVE_IN_FLIGHT),
				lt(workspaceMoves.updatedAt, stale),
			),
		);
	for (const { id } of quiet) {
		await db
			.update(chatMoves)
			.set({
				status: "failed",
				error: "The move stopped answering",
				finishedAt: new Date(),
			})
			.where(
				and(
					eq(chatMoves.workspaceMoveId, id),
					inArray(chatMoves.status, CHAT_MOVE_IN_FLIGHT),
					lt(chatMoves.updatedAt, stale),
				),
			);
		await endWorkspaceMove(id, "The move stopped answering");
	}
}

/**
 * Ends the workspace moves into a destination: those with chats settle from
 * them, those without are done (`ready`) or, with `error`, failed.
 */
export async function finishWorkspaceMovesTo(
	toWorkspaceId: string,
	error?: string,
): Promise<void> {
	const open = await db
		.select({ id: workspaceMoves.id })
		.from(workspaceMoves)
		.where(
			and(
				eq(workspaceMoves.toWorkspaceId, toWorkspaceId),
				inArray(workspaceMoves.status, WORKSPACE_MOVE_IN_FLIGHT),
			),
		);
	for (const { id } of open) await endWorkspaceMove(id, error);
}

/** Settles a move from its chats; one without chats is `ready`, or failed with `error`. */
async function endWorkspaceMove(id: string, error?: string): Promise<void> {
	const [chat] = await db
		.select({ id: chatMoves.id })
		.from(chatMoves)
		.where(eq(chatMoves.workspaceMoveId, id))
		.limit(1);
	if (chat) {
		await settleWorkspaceMove(id);
		return;
	}
	await db
		.update(workspaceMoves)
		.set({
			status: error ? "failed" : "ready",
			error: error ?? null,
			finishedAt: new Date(),
		})
		.where(
			and(
				eq(workspaceMoves.id, id),
				inArray(workspaceMoves.status, WORKSPACE_MOVE_IN_FLIGHT),
			),
		);
}
