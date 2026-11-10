import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { callMoves } from "../../lib/moves";
import { personProcedure } from "../../trpc";
import { assertMovesEnabled } from "../chat-move/utils/assertMovesEnabled";
import {
	abandonWorkspaceMove,
	attachWorkspaceMove,
	beginWorkspaceMove,
} from "../chat-move/utils/createWorkspaceMove";
import { moverOf } from "../chat-move/utils/moverOf";
import { startChatMove } from "../chat-move/utils/startChatMove";
import {
	abandonWorkspaceMoveInputSchema,
	attachWorkspaceMoveInputSchema,
	beginWorkspaceMoveInputSchema,
	workspaceMoveHeartbeatInputSchema,
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
			await assertMovesEnabled(ctx.session.user);
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
				started.push({ moveId, chatSessionId: move.sessionId });
			}
			if (moves.length === 0 && !(await isProvisioning(input.toWorkspaceId))) {
				await callMoves(mover.organizationId, {
					op: "finishInto",
					toWorkspaceId: input.toWorkspaceId,
				});
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

	/**
	 * Keeps a begun move from going stale while its work is still being
	 * pushed. `alive: false` means the move already ended.
	 */
	heartbeat: personProcedure
		.input(workspaceMoveHeartbeatInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const { move } = await callMoves(mover.organizationId, {
				op: "workspaceMove",
				id: input.workspaceMoveId,
			});
			if (!move || move.createdBy !== mover.userId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Move not found" });
			}
			const { alive } = await callMoves(mover.organizationId, {
				op: "touchWorkspaceMove",
				id: input.workspaceMoveId,
			});
			if (alive) return { alive, error: null };
			const ended = await callMoves(mover.organizationId, {
				op: "workspaceMove",
				id: input.workspaceMoveId,
			});
			return { alive, error: ended.move?.error ?? null };
		}),

	/** The newest move out of or into a workspace, or null when it never moved. */
	latest: personProcedure
		.input(workspaceMoveOfWorkspaceInputSchema)
		.query(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const latestBy = (createdBy: string | null) =>
				callMoves(mover.organizationId, {
					op: "latestWorkspaceMove",
					workspaceId: input.workspaceId,
					createdBy,
				});
			let found = input.anyone ? await latestBy(null) : null;
			if (!found?.move) found = await latestBy(mover.userId);
			const { move, chats } = found;
			if (!move) return null;
			const isMine = move.createdBy === mover.userId;
			return {
				id: move.id,
				isMine,
				status: move.status,
				error: isMine ? move.error : null,
				fromWorkspaceId: move.fromWorkspaceId,
				toWorkspaceId: move.toWorkspaceId,
				toHostId: isMine ? move.toHostId : null,
				branch: isMine ? move.branch : null,
				chats,
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
