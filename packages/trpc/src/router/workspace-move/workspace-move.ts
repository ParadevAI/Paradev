import { db } from "@superset/db/client";
import {
	chatMoves,
	cloudWorkspaces,
	workspaceMoves,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, or } from "drizzle-orm";
import { personProcedure } from "../../trpc";
import {
	abandonWorkspaceMove,
	attachWorkspaceMove,
	beginWorkspaceMove,
} from "../chat-move/utils/createWorkspaceMove";
import { moverOf } from "../chat-move/utils/moverOf";
import {
	failStaleWorkspaceMoves,
	finishWorkspaceMovesTo,
} from "../chat-move/utils/settleWorkspaceMove";
import { startChatMove } from "../chat-move/utils/startChatMove";
import {
	abandonWorkspaceMoveInputSchema,
	attachWorkspaceMoveInputSchema,
	beginWorkspaceMoveInputSchema,
	workspaceMoveOfWorkspaceInputSchema,
} from "./schema";

/**
 * Moves a workspace, with its chats, to another workspace. `begin` records
 * the move before its work is pushed; `attach` adds the destination and the
 * chats, or `cloudWorkspace.create({ move })` does when the destination is a
 * new cloud workspace. Each chat then moves on its own through `chatMove`.
 */
export const workspaceMoveRouter = {
	begin: personProcedure
		.input(beginWorkspaceMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			return beginWorkspaceMove({ ...input, ...mover });
		}),

	/** Gives a begun move a destination that already exists, such as one on this computer. */
	attach: personProcedure
		.input(attachWorkspaceMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const { moves, skipped } = await attachWorkspaceMove({
				...input,
				...mover,
			});
			const started = [];
			for (const move of moves) {
				const { moveId } = await startChatMove(move);
				started.push({ moveId, chatSessionId: move.chatSessionId });
			}
			if (moves.length === 0 && !(await isProvisioning(input.toWorkspaceId))) {
				await finishWorkspaceMovesTo(input.toWorkspaceId);
			}
			return {
				moves: started,
				skipped,
				runsOnThisComputer: started.length > 0 && moves[0]?.toHostId !== null,
			};
		}),

	/** Ends a begun move whose work could not be pushed or whose destination could not be made. */
	abandon: personProcedure
		.input(abandonWorkspaceMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			await abandonWorkspaceMove({ ...input, ...mover });
			return { workspaceMoveId: input.workspaceMoveId };
		}),

	/** The newest move out of or into a workspace, or null when it never moved. */
	latest: personProcedure
		.input(workspaceMoveOfWorkspaceInputSchema)
		.query(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			await failStaleWorkspaceMoves(mover.organizationId, input.workspaceId);
			const move = await db.query.workspaceMoves.findFirst({
				where: and(
					or(
						eq(workspaceMoves.fromWorkspaceId, input.workspaceId),
						eq(workspaceMoves.toWorkspaceId, input.workspaceId),
					),
					eq(workspaceMoves.organizationId, mover.organizationId),
					eq(workspaceMoves.createdBy, mover.userId),
				),
				orderBy: desc(workspaceMoves.createdAt),
			});
			if (!move) return null;
			const attempts = await db
				.select({
					sessionId: chatMoves.sessionId,
					status: chatMoves.status,
					createdAt: chatMoves.createdAt,
				})
				.from(chatMoves)
				.where(eq(chatMoves.workspaceMoveId, move.id));
			const newest = new Map<string, { status: string; createdAt: Date }>();
			for (const attempt of attempts) {
				const known = newest.get(attempt.sessionId);
				if (!known || attempt.createdAt > known.createdAt) {
					newest.set(attempt.sessionId, attempt);
				}
			}
			const statuses = [...newest.values()].map((chat) => chat.status);
			return {
				id: move.id,
				status: move.status,
				error: move.error,
				fromWorkspaceId: move.fromWorkspaceId,
				toWorkspaceId: move.toWorkspaceId,
				toHostId: move.toHostId,
				branch: move.branch,
				chats: {
					total: statuses.length,
					ready: statuses.filter((status) => status === "ready").length,
					failed: statuses.filter((status) => status === "failed").length,
				},
				createdAt: move.createdAt,
			};
		}),
} satisfies TRPCRouterRecord;

async function isProvisioning(workspaceId: string): Promise<boolean> {
	const workspace = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
		columns: { status: true },
	});
	return workspace?.status === "provisioning";
}
