import { db, dbWs } from "@superset/db/client";
import {
	chatMoves,
	cloudWorkspaces,
	type SelectChatMove,
	type SelectWorkspaceMove,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
	WORKSPACE_MOVE_IN_FLIGHT,
	workspaceMoves,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { findMovableChat, lastTurnSeq } from "../findMovableChat";
import {
	failStaleWorkspaceMoves,
	settleWorkspaceMove,
} from "../settleWorkspaceMove";

type Owner = { organizationId: string; userId: string };

type CreatedMove = {
	id: string;
	chatSessionId: string;
	toWorkspaceId: string;
	toHostId: string | null;
};

export type SkippedChat = { chatSessionId: string; reason: string };

const createdColumns = {
	id: chatMoves.id,
	chatSessionId: chatMoves.sessionId,
	toWorkspaceId: chatMoves.toWorkspaceId,
	toHostId: chatMoves.toHostId,
};

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
	await failStaleWorkspaceMoves(args.organizationId, args.fromWorkspaceId);

	const [move] = await db
		.insert(workspaceMoves)
		.values({
			organizationId: args.organizationId,
			createdBy: args.userId,
			fromWorkspaceId: args.fromWorkspaceId,
			fromHostId,
			toHostId: args.toHostId ?? null,
		})
		.returning({ id: workspaceMoves.id })
		.catch((error: unknown) => {
			if (isUniqueViolation(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This workspace is already moving",
				});
			}
			throw error;
		});
	if (!move) throw new Error("Could not record the move");
	return { workspaceMoveId: move.id };
}

/**
 * Gives a begun workspace move its destination and branch, and records a
 * `pending` move for each chat that can move, in one transaction. A chat that
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
): Promise<{ moves: CreatedMove[]; skipped: SkippedChat[] }> {
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
	const values: Awaited<ReturnType<typeof chatMoveValues>>[] = [];
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
		values.push(
			await chatMoveValues(args, chat, {
				...parent,
				toWorkspaceId: args.toWorkspaceId,
			}),
		);
	}

	const moves = await dbWs
		.transaction(async (tx) => {
			const [attached] = await tx
				.update(workspaceMoves)
				.set({
					toWorkspaceId: args.toWorkspaceId,
					branch: args.branch,
					...(values.length > 0 ? { status: "moving" as const } : {}),
				})
				.where(
					and(
						eq(workspaceMoves.id, parent.id),
						eq(workspaceMoves.status, "pending"),
						isNull(workspaceMoves.toWorkspaceId),
					),
				)
				.returning({ id: workspaceMoves.id });
			if (!attached) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This move already has its destination",
				});
			}
			if (values.length === 0) return [];
			return tx
				.insert(chatMoves)
				.values(values.map((row) => ({ ...row, workspaceMoveId: parent.id })))
				.returning(createdColumns);
		})
		.catch((error: unknown) => {
			if (isUniqueViolation(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "One of these chats is already moving",
				});
			}
			throw error;
		});
	return { moves, skipped };
}

/** Ends a begun workspace move that never got its destination, as when its work could not be pushed. */
export async function abandonWorkspaceMove(
	args: Owner & { workspaceMoveId: string; error: string },
): Promise<void> {
	const parent = await loadOwnWorkspaceMove(args, args.workspaceMoveId);
	await db
		.update(workspaceMoves)
		.set({ status: "failed", error: args.error, finishedAt: new Date() })
		.where(
			and(
				eq(workspaceMoves.id, parent.id),
				eq(workspaceMoves.status, "pending"),
				isNull(workspaceMoves.toWorkspaceId),
			),
		);
}

/**
 * Tries one chat of a workspace move again, to the same workspace, in the
 * same move. Refused when the chat has left the workspace that moved, when
 * the destination is gone, or when the workspace is moving again.
 */
export async function retryChatMove(
	args: Owner & { failed: SelectChatMove },
): Promise<CreatedMove> {
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
	const [newer] = await db
		.select({ id: workspaceMoves.id })
		.from(workspaceMoves)
		.where(
			and(
				eq(workspaceMoves.organizationId, parent.organizationId),
				eq(workspaceMoves.fromWorkspaceId, parent.fromWorkspaceId),
				inArray(workspaceMoves.status, WORKSPACE_MOVE_IN_FLIGHT),
				ne(workspaceMoves.id, parent.id),
			),
		)
		.limit(1);
	if (newer) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "This workspace is moving again",
		});
	}
	const values = await chatMoveValues(
		args,
		chat,
		{ ...failed, toWorkspaceId: failed.toWorkspaceId },
		failed,
	);
	return dbWs
		.transaction(async (tx) => {
			const [move] = await tx
				.insert(chatMoves)
				.values({ ...values, workspaceMoveId: parent.id })
				.returning(createdColumns);
			if (!move) throw new Error("Could not record the move");
			await settleWorkspaceMove(parent.id, tx);
			return move;
		})
		.catch((error: unknown) => {
			if (isUniqueViolation(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This chat or its workspace is already moving",
				});
			}
			throw error;
		});
}

export async function loadOwnWorkspaceMove(
	owner: Owner,
	workspaceMoveId: string,
): Promise<SelectWorkspaceMove> {
	const move = await db.query.workspaceMoves.findFirst({
		where: and(
			eq(workspaceMoves.id, workspaceMoveId),
			eq(workspaceMoves.organizationId, owner.organizationId),
			eq(workspaceMoves.createdBy, owner.userId),
		),
	});
	if (!move) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Move not found" });
	}
	return move;
}

async function chatMoveValues(
	args: Owner,
	{ session, transcript }: Awaited<ReturnType<typeof findMovableChat>>,
	sides: {
		fromHostId: string | null;
		toWorkspaceId: string;
		toHostId: string | null;
	},
	/** A retry keeps its failed move's turn while it hands on the same bundle. */
	retryOf?: SelectChatMove,
) {
	return {
		sessionId: session.id,
		organizationId: session.organizationId,
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

function isUniqueViolation(error: unknown): boolean {
	const { code, cause } = error as { code?: string; cause?: { code?: string } };
	return code === "23505" || cause?.code === "23505";
}
