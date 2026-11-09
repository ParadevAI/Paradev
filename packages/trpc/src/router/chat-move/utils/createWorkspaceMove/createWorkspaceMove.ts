import { db } from "@superset/db/client";
import {
	cloudWorkspaces,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import type { NewChatMove } from "@superset/shared/move-book";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
	callMoves,
	type SelectChatMove,
	type SelectWorkspaceMove,
} from "../../../../lib/moves";
import { findMovableChat, lastTurnSeq } from "../findMovableChat";

type Owner = { organizationId: string; userId: string };

export type SkippedChat = { chatSessionId: string; reason: string };

/**
 * Records that a workspace is about to move, before any of its work is
 * pushed, so a second attempt at the same workspace is refused before it
 * stops agents or creates a destination. `attachWorkspaceMove` adds the
 * destination and the chats once they exist.
 */
export async function beginWorkspaceMove(
	args: Owner & {
		fromWorkspaceId: string;
		/** The computer the workspace leaves; omitted when it leaves a cloud workspace. */
		fromHostId?: string;
		/** The computer it moves to; omitted when it moves to a new cloud workspace. */
		toHostId?: string;
	},
): Promise<{ workspaceMoveId: string }> {
	await assertSourceInOrganization(args, args.fromWorkspaceId);
	// A computer registers only once it is exposed through the relay, the only
	// way to stop the copy it keeps; an unregistered one still moves.
	const fromHostId =
		(await hostOf(args, args.fromWorkspaceId, args.fromHostId, {
			unregistered: "omit",
		})) ?? null;
	if (args.toHostId && !(await canUseHost(args, args.toHostId))) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Host not found" });
	}
	const { move } = await callMoves(args.organizationId, {
		op: "begin",
		createdBy: args.userId,
		fromWorkspaceId: args.fromWorkspaceId,
		fromHostId,
		toHostId: args.toHostId ?? null,
	});
	return { workspaceMoveId: move.id };
}

/**
 * Gives a begun workspace move its destination and branch, and records a
 * `pending` move for each chat that can move, all at once. A chat that
 * cannot (not synced, no session bundle, already moving, not in the workspace)
 * is returned in `skipped` and stays where it is.
 */
export async function attachWorkspaceMove(
	args: Owner & {
		workspaceMoveId: string;
		toWorkspaceId: string;
		branch: string;
		chatSessionIds: string[];
	},
): Promise<{ moves: SelectChatMove[]; skipped: SkippedChat[] }> {
	const parent = await loadOwnWorkspaceMove(args, args.workspaceMoveId);
	if (parent.toWorkspaceId !== null || parent.status !== "pending") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This move already has its destination",
		});
	}
	if (parent.fromWorkspaceId === args.toWorkspaceId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This workspace is already there",
		});
	}
	const toHostId = await hostOf(
		args,
		args.toWorkspaceId,
		parent.toHostId ?? undefined,
		{ ownCloudWorkspace: true },
	);
	if (toHostId === undefined || toHostId !== parent.toHostId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "That workspace is not where this move goes",
		});
	}

	const skipped: SkippedChat[] = [];
	const chats: NewChatMove[] = [];
	for (const chatSessionId of new Set(args.chatSessionIds)) {
		const chat = await findMovableChat({ ...args, chatSessionId }).catch(
			(error: unknown) => {
				if (!(error instanceof TRPCError)) throw error;
				skipped.push({ chatSessionId, reason: error.message });
				return null;
			},
		);
		if (!chat) continue;
		if (chat.session.v2WorkspaceId !== parent.fromWorkspaceId) {
			skipped.push({
				chatSessionId,
				reason: "This chat is not in the workspace that moves",
			});
			continue;
		}
		chats.push(
			await newChatMove(args, chat, {
				...parent,
				toWorkspaceId: args.toWorkspaceId,
			}),
		);
	}

	const { moves } = await callMoves(args.organizationId, {
		op: "attach",
		workspaceMoveId: parent.id,
		toWorkspaceId: args.toWorkspaceId,
		branch: args.branch,
		chats,
	});
	return { moves, skipped };
}

/** Ends a begun workspace move that never got its destination, as when its work could not be pushed. */
export async function abandonWorkspaceMove(
	args: Owner & { workspaceMoveId: string; error: string },
): Promise<void> {
	const parent = await loadOwnWorkspaceMove(args, args.workspaceMoveId);
	await callMoves(args.organizationId, {
		op: "abandon",
		workspaceMoveId: parent.id,
		error: args.error,
	});
}

/**
 * Tries one chat of a workspace move again, to the same workspace, in the
 * same move. Refused when the chat has left the workspace that moved, when
 * the destination is gone, or when the workspace is moving again.
 */
export async function retryChatMove(
	args: Owner & { failed: SelectChatMove },
): Promise<SelectChatMove> {
	const { failed } = args;
	const parent = await loadOwnWorkspaceMove(args, failed.workspaceMoveId);
	const chat = await findMovableChat({
		...args,
		chatSessionId: failed.sessionId,
	});
	if (chat.session.v2WorkspaceId !== parent.fromWorkspaceId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This chat is no longer in the workspace it moved from",
		});
	}
	if (!failed.toHostId) {
		const destination = await db.query.cloudWorkspaces.findFirst({
			where: eq(cloudWorkspaces.id, failed.toWorkspaceId),
			columns: { status: true },
		});
		if (
			destination?.status !== "ready" &&
			destination?.status !== "provisioning"
		) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "The workspace it was moving to is gone",
			});
		}
	}
	const { move } = await callMoves(args.organizationId, {
		op: "retry",
		workspaceMoveId: parent.id,
		chat: await newChatMove(args, chat, failed, failed),
	});
	return move;
}

export async function loadOwnWorkspaceMove(
	owner: Owner,
	workspaceMoveId: string,
): Promise<SelectWorkspaceMove> {
	const { move } = await callMoves(owner.organizationId, {
		op: "workspaceMove",
		id: workspaceMoveId,
	});
	if (!move || move.createdBy !== owner.userId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Move not found" });
	}
	return move;
}

async function newChatMove(
	args: Owner,
	{ session, transcript }: Awaited<ReturnType<typeof findMovableChat>>,
	sides: {
		fromHostId: string | null;
		toWorkspaceId: string;
		toHostId: string | null;
	},
	/** A retry keeps its failed move's turn while it hands on the same bundle. */
	retryOf?: SelectChatMove,
): Promise<NewChatMove> {
	return {
		sessionId: session.id,
		createdBy: args.userId,
		fromWorkspaceId: session.v2WorkspaceId,
		fromHostId: sides.fromHostId,
		toWorkspaceId: sides.toWorkspaceId,
		toHostId: sides.toHostId,
		sourceTurnSeq:
			retryOf?.transcriptId === transcript.id && retryOf.sourceTurnSeq !== null
				? retryOf.sourceTurnSeq
				: await lastTurnSeq(session.id),
		transcriptId: transcript.id,
		harnessSessionId: transcript.harnessSessionId,
	};
}

/** A workspace named as the one that moves must be in the caller's organization, when it is known at all. */
async function assertSourceInOrganization(
	owner: Owner,
	workspaceId: string,
): Promise<void> {
	const cloud = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
		columns: { organizationId: true },
	});
	const registered = cloud
		? null
		: await db.query.v2Workspaces.findFirst({
				where: eq(v2Workspaces.id, workspaceId),
				columns: { organizationId: true },
			});
	const organizationId = cloud?.organizationId ?? registered?.organizationId;
	if (organizationId && organizationId !== owner.organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
}

/**
 * A host the caller may use, or one that never registered: a computer
 * registers only once it is exposed through the relay, so most cannot be
 * checked. Another person's registered host is refused.
 */
async function canUseHost(owner: Owner, hostId: string): Promise<boolean> {
	const reachable = await db.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.organizationId, owner.organizationId),
			eq(v2UsersHosts.userId, owner.userId),
			eq(v2UsersHosts.hostId, hostId),
		),
		columns: { hostId: true },
	});
	if (reachable) return true;
	const known = await db.query.v2Hosts.findFirst({
		where: and(
			eq(v2Hosts.organizationId, owner.organizationId),
			eq(v2Hosts.machineId, hostId),
		),
		columns: { machineId: true },
	});
	return !known;
}

/**
 * Null for a cloud workspace in the organization, the computer it is on
 * (its registered host, else the named one) when the caller may use it, and
 * undefined when neither is known, or with `unregistered: "omit"`, when the
 * caller cannot use it. A chat only moves into a cloud workspace
 * the caller started: the move runs an agent there with that box's
 * credentials.
 */
async function hostOf(
	owner: Owner,
	workspaceId: string,
	hostId: string | undefined,
	options: { ownCloudWorkspace?: boolean; unregistered?: "omit" } = {},
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
	if (await canUseHost(owner, resolved)) return resolved;
	if (options.unregistered === "omit") return undefined;
	throw new TRPCError({ code: "NOT_FOUND", message: "Host not found" });
}
