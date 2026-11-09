import { z } from "zod";
import { MAX_MOVED_CHATS } from "../chat-move/schema";

export const beginWorkspaceMoveInputSchema = z.object({
	/** The workspace that moves: on a computer, or in the cloud. */
	fromWorkspaceId: z.string().uuid(),
	/** The computer it leaves; omitted when it leaves a cloud workspace. */
	fromHostId: z.string().min(1).max(200).optional(),
	/** The computer it moves to; omitted when it moves to a new cloud workspace. */
	toHostId: z.string().min(1).max(200).optional(),
});

export const attachWorkspaceMoveInputSchema = z.object({
	workspaceMoveId: z.string().uuid(),
	/** The workspace it moves into, which now exists. */
	toWorkspaceId: z.string().uuid(),
	/** The snapshot branch `teleport.prepareWorkspace` pushed. */
	branch: z.string().min(1).max(255),
	/** Its chats that move with it; may be none. */
	chatSessionIds: z.array(z.string().uuid()).max(MAX_MOVED_CHATS).default([]),
});

export const abandonWorkspaceMoveInputSchema = z.object({
	workspaceMoveId: z.string().uuid(),
	error: z.string().min(1).max(2000),
});

export const workspaceMoveOfWorkspaceInputSchema = z.object({
	workspaceId: z.string().uuid(),
});

export const workspaceMoveHeartbeatInputSchema = z.object({
	workspaceMoveId: z.string().uuid(),
});
