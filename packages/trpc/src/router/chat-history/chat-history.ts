import { dbWs } from "@superset/db/client";
import { chatItems, chatSessions, chatTurns } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { personProcedure, userError } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { pushInputSchema, searchInputSchema } from "./schema";
import {
	assertBoxWorkspace,
	type ChatHistoryCaller,
	canAccess,
} from "./utils/access";
import { foldEvents } from "./utils/foldEvents";
import { searchChats } from "./utils/searchChats";

type ProtectedCtx = Parameters<typeof requireActiveOrgMembership>[0] & {
	sandboxCaller: ChatHistoryCaller["sandbox"];
};

async function callerOf(ctx: ProtectedCtx): Promise<ChatHistoryCaller> {
	return {
		userId: ctx.session.user.id,
		organizationId: await requireActiveOrgMembership(ctx),
		sandbox: ctx.sandboxCaller,
	};
}

function movedAway(): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: "This chat moved to another workspace",
	});
}

/**
 * Chats kept off the machine they run on: the latest state of each item and
 * turn. A host pushes as it goes.
 */
export const chatHistoryRouter = {
	push: personProcedure
		.input(pushInputSchema)
		.mutation(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			assertBoxWorkspace(caller, input.workspaceId);
			const folded = foldEvents(input.events);

			await dbWs.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(chatSessions)
					.where(eq(chatSessions.id, input.sessionId))
					.for("update");

				if (!existing) {
					await tx.insert(chatSessions).values({
						id: input.sessionId,
						organizationId: caller.organizationId,
						createdBy: caller.userId,
						v2WorkspaceId: input.workspaceId,
						harness: input.harness,
						harnessSessionId: input.harnessSessionId,
						epoch: input.epoch,
						lastSeq: 0,
					});
				} else {
					// Owner only: a box whose chat moved away must hear CONFLICT, not NOT_FOUND.
					if (!canAccess({ ...caller, sandbox: null }, existing)) {
						throw userError({
							code: "NOT_FOUND",
							message: "Chat session not found",
							i18nKey: "serverError.chat.chatSessionNotFound",
						});
					}
					if (existing.v2WorkspaceId !== input.workspaceId) throw movedAway();
					if (existing.epoch !== input.epoch) {
						await tx
							.delete(chatItems)
							.where(eq(chatItems.sessionId, input.sessionId));
						await tx
							.delete(chatTurns)
							.where(eq(chatTurns.sessionId, input.sessionId));
					}
				}

				if (folded.items.length > 0) {
					await tx
						.insert(chatItems)
						.values(
							folded.items.map((item) => ({
								sessionId: input.sessionId,
								organizationId:
									existing?.organizationId ?? caller.organizationId,
								createdBy: existing?.createdBy ?? caller.userId,
								epoch: input.epoch,
								...item,
							})),
						)
						.onConflictDoUpdate({
							target: [chatItems.sessionId, chatItems.itemId],
							set: newerWins(chatItems, [
								"turn_id",
								"kind",
								"started_at",
								"body",
								"search_text",
							]),
						});
				}

				if (folded.turns.length > 0) {
					await tx
						.insert(chatTurns)
						.values(
							folded.turns.map((turn) => ({
								sessionId: input.sessionId,
								epoch: input.epoch,
								...turn,
							})),
						)
						.onConflictDoUpdate({
							target: [chatTurns.sessionId, chatTurns.turnId],
							set: newerWins(chatTurns, [
								"status",
								"started_at",
								"completed_at",
								"usage",
								"body",
							]),
						});
				}

				const sameEpoch = existing?.epoch === input.epoch;
				const storedSeq = sameEpoch ? (existing?.lastSeq ?? 0) : 0;
				const batchIsStale = sameEpoch && folded.lastSeq <= storedSeq;
				const freshState =
					folded.session && folded.session.seq > storedSeq
						? folded.session.state
						: null;
				await tx
					.update(chatSessions)
					.set({
						harness: input.harness,
						harnessSessionId: batchIsStale
							? (existing?.harnessSessionId ?? input.harnessSessionId)
							: (freshState?.harnessSessionId ??
								input.harnessSessionId ??
								(sameEpoch ? existing?.harnessSessionId : null)),
						epoch: input.epoch,
						lastSeq: sameEpoch
							? sql`greatest(coalesce(${chatSessions.lastSeq}, 0), ${folded.lastSeq})`
							: folded.lastSeq,
						...(freshState ? { status: freshState.status } : {}),
						...(freshState?.title !== undefined
							? { title: freshState.title }
							: !sameEpoch
								? { title: null }
								: {}),
						...(batchIsStale ? {} : { lastActiveAt: new Date() }),
					})
					.where(eq(chatSessions.id, input.sessionId));
			});

			return { ackedSeq: folded.lastSeq };
		}),

	search: personProcedure
		.input(searchInputSchema)
		.query(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			return searchChats({
				query: input.query,
				userId: caller.userId,
				organizationId: caller.organizationId,
				limit: input.limit,
			});
		}),
} satisfies TRPCRouterRecord;

/**
 * An upsert where the newest version of a row wins, whatever order retries
 * arrive in. `first_seq` keeps the earliest seen.
 */
function newerWins(
	table: typeof chatItems | typeof chatTurns,
	columns: string[],
) {
	const newer = sql`excluded.seq > ${table.seq}`;
	const set: Record<string, ReturnType<typeof sql>> = {
		seq: sql`greatest(${table.seq}, excluded.seq)`,
		firstSeq: sql`least(${table.firstSeq}, excluded.first_seq)`,
		updatedAt: sql`now()`,
	};
	for (const column of columns) {
		const name = sql.identifier(column);
		set[toCamel(column)] =
			sql`case when ${newer} then excluded.${name} else ${table}.${name} end`;
	}
	return set;
}

function toCamel(column: string): string {
	return column.replace(/_([a-z])/g, (_, letter: string) =>
		letter.toUpperCase(),
	);
}
