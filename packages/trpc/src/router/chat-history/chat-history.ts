import { db, dbWs } from "@superset/db/client";
import {
	chatItems,
	chatSessions,
	chatTranscripts,
	chatTurns,
	cloudWorkspaces,
	files,
} from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { anchorAttachments } from "../../lib/attachments";
import { detachAll, reapOrphanFiles } from "../../lib/files";
import { callMoves } from "../../lib/moves";
import { presignedPutUrl } from "../../lib/r2";
import { personProcedure, userError } from "../../trpc";
import { isMovesEnabled } from "../chat-move/utils/assertMovesEnabled";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	chatEventsInputSchema,
	chatsOfWorkspaceInputSchema,
	createTranscriptUploadInputSchema,
	pushInputSchema,
	searchInputSchema,
	transcriptInputSchema,
} from "./schema";
import {
	assertBoxWorkspace,
	type ChatHistoryCaller,
	canAccess,
	loadAccessibleSession,
} from "./utils/access";
import { foldEvents } from "./utils/foldEvents";
import { loadChatHistory } from "./utils/loadChatHistory";
import { loadLatestChatHistory } from "./utils/loadLatestChatHistory";
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

/** Not a conflict: the chat's home switches here once its move is ready. */
function stillMovingHere(): TRPCError {
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message: "This chat is still moving to this workspace",
	});
}

/**
 * Asked before the row lock, so a slow or unreachable move store never holds
 * it. A chat with no home yet, as an automation records it, is not moving.
 */
async function chatMovingHere(
	caller: ChatHistoryCaller,
	input: { sessionId: string; workspaceId: string },
): Promise<boolean> {
	const row = await db.query.chatSessions.findFirst({
		columns: { organizationId: true, createdBy: true, v2WorkspaceId: true },
		where: eq(chatSessions.id, input.sessionId),
	});
	if (
		!row ||
		row.v2WorkspaceId === null ||
		row.v2WorkspaceId === input.workspaceId ||
		row.organizationId !== caller.organizationId ||
		row.createdBy !== caller.userId
	) {
		return false;
	}
	try {
		const { moving } = await callMoves(caller.organizationId, {
			op: "chatMoving",
			sessionId: input.sessionId,
			freshInto: input.workspaceId,
		});
		return moving;
	} catch (error) {
		throw new TRPCError({
			code: "SERVICE_UNAVAILABLE",
			message: "Could not check whether this chat is moving",
			cause: error,
		});
	}
}

/**
 * Chats kept off the machine they run on: the latest state of each item and
 * turn, and the agent's own session files. A host pushes as it goes; when a
 * chat moves, `chatMove` hands both to the host it moves to.
 */
/** As many chats as the preview of a sleeping cloud workspace lists. */
const MAX_WORKSPACE_CHATS = 20;

export const chatHistoryRouter = {
	/** Whether a cloud box keeps its chats in the cloud as they happen. */
	syncEnabled: personProcedure.query(async ({ ctx }) => ({
		enabled: await isMovesEnabled(ctx.session.user),
	})),

	push: personProcedure
		.input(pushInputSchema)
		.mutation(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			assertBoxWorkspace(caller, input.workspaceId);
			const folded = foldEvents(input.events);
			const movingHere = await chatMovingHere(caller, input);

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
					const own =
						existing.organizationId === caller.organizationId &&
						existing.createdBy === caller.userId;
					if (own && existing.v2WorkspaceId === null) {
						await tx
							.update(chatSessions)
							.set({ v2WorkspaceId: input.workspaceId })
							.where(eq(chatSessions.id, input.sessionId));
						existing.v2WorkspaceId = input.workspaceId;
					}
					if (
						own &&
						movingHere &&
						existing.v2WorkspaceId !== input.workspaceId
					) {
						throw stillMovingHere();
					}
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

	createTranscriptUpload: personProcedure
		.input(createTranscriptUploadInputSchema)
		.mutation(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			const session = await loadAccessibleSession(caller, input.sessionId);

			const { transcriptId, fileId } = await dbWs.transaction(async (tx) => {
				const [file] = await tx
					.insert(files)
					.values({
						organizationId: session.organizationId,
						name: `${input.harnessSessionId}.tar.gz`,
						contentType: "application/gzip",
						sizeBytes: input.sizeBytes,
						sha256: input.sha256,
						createdByUserId: caller.userId,
					})
					.returning({ id: files.id });
				if (!file) throw new Error("Failed to record the transcript file");
				const [transcript] = await tx
					.insert(chatTranscripts)
					.values({
						sessionId: session.id,
						organizationId: session.organizationId,
						fileId: file.id,
						harness: input.harness,
						harnessSessionId: input.harnessSessionId,
						sourceCwd: input.sourceCwd,
						byteLength: input.sizeBytes,
						sha256: input.sha256,
					})
					.returning({ id: chatTranscripts.id });
				if (!transcript) throw new Error("Failed to record the transcript");
				return { transcriptId: transcript.id, fileId: file.id };
			});

			const upload = await presignedPutUrl({
				key: fileOriginalKey(fileId),
				contentType: "application/gzip",
				contentLength: input.sizeBytes,
				expiresInSeconds: 60 * 60,
			});
			return { transcriptId, upload };
		}),

	/** Keeps an uploaded bundle: without this the file sweep reclaims it a day later. */
	completeTranscriptUpload: personProcedure
		.input(transcriptInputSchema)
		.mutation(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			const transcript = await loadTranscript(input.transcriptId);
			await loadAccessibleSession(caller, transcript.sessionId);

			await anchorAttachments({
				parentKind: "chat_session",
				parentId: transcript.sessionId,
				organizationId: transcript.organizationId,
				fileIds: [transcript.fileId],
			});
			const session = await db.query.chatSessions.findFirst({
				where: eq(chatSessions.id, transcript.sessionId),
				columns: { id: true },
			});
			if (!session) {
				await reapOrphanFiles(
					await detachAll({
						parentKind: "chat_session",
						parentIds: [transcript.sessionId],
					}),
				);
				throw userError({
					code: "NOT_FOUND",
					message: "Chat session not found",
					i18nKey: "serverError.chat.chatSessionNotFound",
				});
			}
			const file = await db.query.files.findFirst({
				where: eq(files.id, transcript.fileId),
				columns: { status: true },
			});
			if (file?.status !== "ready") {
				throw userError({
					code: "BAD_REQUEST",
					message: "Attachment was not uploaded — send the bytes first",
					i18nKey: "serverError.attachment.notUploaded",
				});
			}
			return { transcriptId: transcript.id };
		}),

	/** The caller's chats stored for a cloud workspace, newest first; none for a computer's. */
	ofWorkspace: personProcedure
		.input(chatsOfWorkspaceInputSchema)
		.query(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			if (!(await isCloudWorkspace(input.workspaceId))) return [];
			return db
				.select({
					id: chatSessions.id,
					title: chatSessions.title,
					harness: chatSessions.harness,
					lastActiveAt: chatSessions.lastActiveAt,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.v2WorkspaceId, input.workspaceId),
						eq(chatSessions.organizationId, caller.organizationId),
						eq(chatSessions.createdBy, caller.userId),
						isNotNull(chatSessions.epoch),
					),
				)
				.orderBy(desc(chatSessions.lastActiveAt))
				.limit(MAX_WORKSPACE_CHATS);
		}),

	/** A page of a stored chat, in the order it shows, as its host recorded it. */
	events: personProcedure
		.input(chatEventsInputSchema)
		.query(async ({ ctx, input }) => {
			const caller = await callerOf(ctx);
			const session = await loadAccessibleSession(caller, input.chatSessionId);
			// Only a cloud box keeps its chats here; a computer's copy is as old as its last move.
			if (
				!session.v2WorkspaceId ||
				!(await isCloudWorkspace(session.v2WorkspaceId))
			) {
				return {
					epoch: null,
					events: [],
					nextAfterSeq: null,
					nextBeforeSeq: null,
				};
			}
			if (input.latest) {
				const { events, nextBeforeSeq } = await loadLatestChatHistory(session, {
					beforeSeq: input.beforeSeq,
					limit: input.limit,
				});
				return {
					epoch: session.epoch,
					events,
					nextAfterSeq: null,
					nextBeforeSeq,
				};
			}
			const { events } = await loadChatHistory(session, {
				afterSeq: input.afterSeq,
				limit: input.limit,
			});
			return {
				epoch: session.epoch,
				events,
				nextAfterSeq:
					events.length === input.limit ? (events.at(-1)?.seq ?? null) : null,
				nextBeforeSeq: null,
			};
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

async function isCloudWorkspace(workspaceId: string): Promise<boolean> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
		columns: { id: true },
	});
	return row !== undefined;
}

/** The box's workspace held the chat until a move took it elsewhere. */
async function loadTranscript(transcriptId: string) {
	const transcript = await db.query.chatTranscripts.findFirst({
		where: eq(chatTranscripts.id, transcriptId),
	});
	if (!transcript) {
		throw userError({
			code: "NOT_FOUND",
			message: "Chat session not found",
			i18nKey: "serverError.chat.chatSessionNotFound",
		});
	}
	return transcript;
}

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
