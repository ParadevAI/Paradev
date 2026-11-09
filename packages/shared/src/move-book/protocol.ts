export const CHAT_MOVE_STATUSES = [
	"pending",
	"copying",
	"restoring",
	"ready",
	"failed",
] as const;
export type ChatMoveStatus = (typeof CHAT_MOVE_STATUSES)[number];

export const WORKSPACE_MOVE_STATUSES = [
	"pending",
	"moving",
	"ready",
	"partial",
	"failed",
] as const;
export type WorkspaceMoveStatus = (typeof WORKSPACE_MOVE_STATUSES)[number];

/** A chat move the control plane is still running. */
export const CHAT_MOVE_IN_FLIGHT = ["pending", "copying", "restoring"] as const;

/** A workspace move whose chats are still moving. */
export const WORKSPACE_MOVE_IN_FLIGHT = ["pending", "moving"] as const;

/** Longer than a move job may run, so a move this quiet has stopped. */
export const STALE_MOVE_MS = 6 * 60 * 1000;

export const MOVE_STOPPED_ANSWERING = "The move stopped answering";

/**
 * One attempt to move a workspace to another one: its code, as one snapshot
 * branch, and each of its chats, as a chat move. `partial` means some chats
 * moved and some did not; each one that did not can be tried again.
 */
export type WorkspaceMove = {
	id: string;
	organizationId: string;
	createdBy: string;
	fromWorkspaceId: string;
	/** Null when it leaves a cloud workspace, or a computer that never registered. */
	fromHostId: string | null;
	/** Null until the destination exists: a move is recorded before its work is pushed. */
	toWorkspaceId: string | null;
	/** Null when it moves to a cloud workspace. */
	toHostId: string | null;
	/** The snapshot branch the new workspace starts from; null until it is pushed. */
	branch: string | null;
	status: WorkspaceMoveStatus;
	error: string | null;
	createdAt: number;
	updatedAt: number;
	finishedAt: number | null;
};

/**
 * One chat's part of a workspace move. The chat itself names its old
 * workspace until the attempt is `ready`, so a failed attempt leaves the
 * chat where it was.
 */
export type ChatMove = {
	id: string;
	workspaceMoveId: string;
	sessionId: string;
	organizationId: string;
	createdBy: string;
	fromWorkspaceId: string | null;
	/** The computer the chat leaves; null when it leaves a cloud workspace. */
	fromHostId: string | null;
	toWorkspaceId: string;
	/** The computer the chat moves to; null when it moves to a cloud workspace. */
	toHostId: string | null;
	/** The newest turn the chat had when the move began; a newer one means the source kept going. */
	sourceTurnSeq: number | null;
	transcriptId: string;
	harnessSessionId: string;
	status: ChatMoveStatus;
	error: string | null;
	createdAt: number;
	updatedAt: number;
	finishedAt: number | null;
};

export type NewChatMove = Pick<
	ChatMove,
	| "sessionId"
	| "createdBy"
	| "fromWorkspaceId"
	| "fromHostId"
	| "toWorkspaceId"
	| "toHostId"
	| "sourceTurnSeq"
	| "transcriptId"
	| "harnessSessionId"
>;

export type MoveChatCounts = { total: number; ready: number; failed: number };

export type MoveBookRequest =
	| {
			op: "begin";
			createdBy: string;
			fromWorkspaceId: string;
			fromHostId: string | null;
			toHostId: string | null;
	  }
	| {
			op: "attach";
			workspaceMoveId: string;
			toWorkspaceId: string;
			branch: string;
			chats: NewChatMove[];
	  }
	| { op: "abandon"; workspaceMoveId: string; error: string }
	| { op: "retry"; workspaceMoveId: string; chat: NewChatMove }
	| { op: "workspaceMove"; id: string }
	| { op: "chatMove"; id: string }
	| { op: "latestWorkspaceMove"; workspaceId: string; createdBy: string }
	| { op: "latestChatMove"; sessionId: string; createdBy: string }
	| {
			op: "chatMoving";
			sessionId: string;
			/** Only a move into this workspace that changed state recently. */
			freshInto?: string;
	  }
	| { op: "claim"; id: string }
	| { op: "touchWorkspaceMove"; id: string }
	| { op: "touchChatMove"; id: string }
	| { op: "finish"; id: string }
	| {
			op: "fail";
			id: string;
			error: string;
			/** Also fails a `ready` move, whose chat could not be switched after all. */
			evenIfReady?: boolean;
	  }
	| { op: "pendingInto"; toWorkspaceId: string }
	| { op: "finishInto"; toWorkspaceId: string }
	| { op: "failInto"; toWorkspaceId: string; error: string };

type Replies = {
	begin: { move: WorkspaceMove };
	attach: { moves: ChatMove[] };
	abandon: Record<never, never>;
	retry: { move: ChatMove };
	workspaceMove: { move: WorkspaceMove | null };
	chatMove: { move: ChatMove | null };
	latestWorkspaceMove: {
		move: WorkspaceMove | null;
		chats: MoveChatCounts;
	};
	latestChatMove: { move: ChatMove | null };
	chatMoving: { moving: boolean };
	claim: { move: ChatMove | null };
	touchWorkspaceMove: { alive: boolean };
	touchChatMove: { alive: boolean };
	finish: { finished: boolean };
	fail: Record<never, never>;
	pendingInto: { ids: string[] };
	finishInto: Record<never, never>;
	failInto: Record<never, never>;
};

export type MoveBookOp = MoveBookRequest["op"];

export type MoveBookReplyFor<Op extends MoveBookOp> = {
	ok: true;
} & Replies[Op];

export type MoveBookRefusalCode =
	| "conflict"
	| "precondition"
	| "not_found"
	| "invalid";

export type MoveBookRefusal = {
	ok: false;
	code: MoveBookRefusalCode;
	message: string;
};

export type MoveBookResponse = MoveBookReplyFor<MoveBookOp> | MoveBookRefusal;

export function moveBookPath(organizationId: string): string {
	return `/v2/org/${encodeURIComponent(organizationId)}/moves`;
}
