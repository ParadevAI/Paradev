import { db } from "@superset/db/client";
import {
	chatMoves,
	cloudWorkspaces,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { findMovableChat, lastTurnSeq } from "../findMovableChat";

type Owner = { organizationId: string; userId: string };

type CreatedMove = {
	id: string;
	chatSessionId: string;
	toWorkspaceId: string;
	toHostId: string | null;
};

/**
 * Records a `pending` move for each chat of one workspace, all into the same
 * destination, in one statement: either every chat's move is recorded or
 * none is. Nothing runs until a move is queued. A workspace on a computer may
 * not be registered yet, so the caller names the host of each side that is
 * not a cloud workspace.
 */
export async function createChatMoves(
	args: Owner & {
		chatSessionIds: string[];
		toWorkspaceId: string;
		toHostId?: string;
		fromHostId?: string;
		/** A retry keeps its failed move's turn while it hands on the same bundle. */
		retryOf?: { transcriptId: string; sourceTurnSeq: number | null };
	},
): Promise<CreatedMove[]> {
	const chatSessionIds = [...new Set(args.chatSessionIds)];
	if (chatSessionIds.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Name at least one chat to move",
		});
	}
	const chats = [];
	for (const chatSessionId of chatSessionIds) {
		chats.push(await findMovableChat({ ...args, chatSessionId }));
	}
	const fromWorkspaceId = chats[0]?.session.v2WorkspaceId ?? null;
	if (chats.some(({ session }) => session.v2WorkspaceId !== fromWorkspaceId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "These chats are not in one workspace",
		});
	}
	if (fromWorkspaceId === args.toWorkspaceId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This chat is already in that workspace",
		});
	}
	const toHostId = await hostOf(args, args.toWorkspaceId, args.toHostId, {
		ownCloudWorkspace: true,
	});
	if (toHostId === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Name the computer the chat moves to",
		});
	}
	const fromHostId = fromWorkspaceId
		? await hostOf(args, fromWorkspaceId, args.fromHostId)
		: null;
	if (fromHostId === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Name the computer the chat moves from",
		});
	}

	const values = [];
	for (const { session, transcript } of chats) {
		values.push({
			sessionId: session.id,
			organizationId: session.organizationId,
			createdBy: args.userId,
			fromWorkspaceId,
			fromHostId,
			toWorkspaceId: args.toWorkspaceId,
			toHostId,
			sourceTurnSeq:
				args.retryOf?.transcriptId === transcript.id &&
				args.retryOf.sourceTurnSeq !== null
					? args.retryOf.sourceTurnSeq
					: await lastTurnSeq(session.id),
			transcriptId: transcript.id,
			harnessSessionId: transcript.harnessSessionId,
		});
	}
	return db
		.insert(chatMoves)
		.values(values)
		.returning({
			id: chatMoves.id,
			chatSessionId: chatMoves.sessionId,
			toWorkspaceId: chatMoves.toWorkspaceId,
			toHostId: chatMoves.toHostId,
		})
		.catch((error: unknown) => {
			if (isUniqueViolation(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This chat is already moving",
				});
			}
			throw error;
		});
}

export async function createChatMove(
	args: Omit<Parameters<typeof createChatMoves>[0], "chatSessionIds"> & {
		chatSessionId: string;
	},
): Promise<CreatedMove> {
	const { chatSessionId, ...rest } = args;
	const [move] = await createChatMoves({
		...rest,
		chatSessionIds: [chatSessionId],
	});
	if (!move) throw new Error("Could not record the move");
	return move;
}

/**
 * Null for a cloud workspace in the organization, the computer it is on
 * (its registered host, else the named one) when the caller may use it, and
 * undefined when neither is known. A chat only moves into a cloud workspace
 * the caller started: the move runs an agent there with that box's
 * credentials.
 */
async function hostOf(
	owner: Owner,
	workspaceId: string,
	hostId: string | undefined,
	options: { ownCloudWorkspace?: boolean } = {},
): Promise<string | null | undefined> {
	const cloud = await db.query.cloudWorkspaces.findFirst({
		where: and(
			eq(cloudWorkspaces.id, workspaceId),
			eq(cloudWorkspaces.organizationId, owner.organizationId),
		),
		columns: { id: true, createdByUserId: true },
	});
	if (cloud) {
		if (options.ownCloudWorkspace && cloud.createdByUserId !== owner.userId) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "A chat can only move into a cloud workspace you started",
			});
		}
		return null;
	}
	const registered = await db.query.v2Workspaces.findFirst({
		where: and(
			eq(v2Workspaces.id, workspaceId),
			eq(v2Workspaces.organizationId, owner.organizationId),
		),
		columns: { hostId: true },
	});
	if (registered && hostId && registered.hostId !== hostId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "That workspace is not on that computer",
		});
	}
	const resolved = registered?.hostId ?? hostId;
	if (!resolved) return undefined;
	const reachable = await db.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.organizationId, owner.organizationId),
			eq(v2UsersHosts.userId, owner.userId),
			eq(v2UsersHosts.hostId, resolved),
		),
		columns: { hostId: true },
	});
	if (!reachable) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Host not found" });
	}
	return resolved;
}

function isUniqueViolation(error: unknown): boolean {
	const { code, cause } = error as { code?: string; cause?: { code?: string } };
	return code === "23505" || cause?.code === "23505";
}
