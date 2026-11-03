import { presetForAcpHarness } from "@superset/chat/core";
import type { ChatRuntime } from "@superset/chat-runtime";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import type { HostServiceContext } from "../../../types";
import { chatContinuationTarget, chatLaunchTarget } from "../agents/agents";
import { seedDefaultsIfEmpty } from "../settings/agent-configs";
import { seedAgentFolderTrust } from "../workspace-creation/shared/seed-agent-trust";
import { createChatSession } from "./create-chat-session";

export const createChatSessionSchema = z
	.object({
		workspaceId: z.string().uuid(),
		agent: z.string().min(1),
		prompt: z.string().default(""),
		model: z.string().min(1).optional(),
		mode: z.string().min(1).optional(),
		resumeSessionId: z.string().min(1).optional(),
		continueSessionId: z.string().min(1).optional(),
		attachmentIds: z.array(z.string().uuid()).optional(),
		commandId: z.string().uuid().optional(),
	})
	.strict()
	.refine((input) => !(input.resumeSessionId && input.continueSessionId), {
		message: "Choose resumeSessionId or continueSessionId, not both",
	});
export type CreateChatSessionInput = z.input<typeof createChatSessionSchema>;
export type ChatSessionResult = {
	kind: "chat";
	sessionId: string;
	terminalId: string;
	label: string;
};
type SessionContext = Pick<
	HostServiceContext,
	"db" | "runtime" | "terminalAgentStore"
>;

export function requireChatRuntime(
	ctx: Pick<HostServiceContext, "runtime">,
): ChatRuntime {
	const chat = ctx.runtime.chat?.();
	if (!chat)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"ACP chat sessions are not available on this host. Update host-service.",
		});
	return chat;
}

export function requireSessionWorkspace(
	ctx: Pick<HostServiceContext, "db">,
	workspaceId: string,
) {
	const workspace = ctx.db.query.workspaces
		.findFirst({
			where: and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)),
		})
		.sync();
	if (!workspace)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${workspaceId} not found on this host — it may have been deleted.`,
		});
	return workspace;
}

export function requireChatSession(
	ctx: SessionContext,
	workspaceId: string,
	sessionId: string,
) {
	requireSessionWorkspace(ctx, workspaceId);
	const chat = requireChatRuntime(ctx);
	const result = chat.commands.getSession({ sessionId });
	if (!result.session || result.session.scopeId !== workspaceId)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Chat session ${sessionId} not found in workspace ${workspaceId}.`,
		});
	if (!presetForAcpHarness(result.session.harness))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This is not an ACP chat session.",
		});
	return { chat, ...result, session: result.session };
}

export async function createChatSessionInWorkspace(
	ctx: SessionContext,
	rawInput: CreateChatSessionInput,
): Promise<ChatSessionResult> {
	const input = createChatSessionSchema.parse(rawInput);
	const workspace = requireSessionWorkspace(ctx, input.workspaceId);
	seedDefaultsIfEmpty(ctx.db);
	const target = chatLaunchTarget(ctx.db, {
		workspaceId: input.workspaceId,
		agent: input.agent,
		prompt: input.prompt,
		surface: "chat",
		model: input.model,
		attachmentIds: input.attachmentIds,
	});
	if (!target)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Agent ${input.agent} or its attachments cannot be used with ACP chat. No terminal was launched.`,
		});
	const chat = requireChatRuntime(ctx);
	if (!chat.live.supports(target.harness))
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `ACP provider ${target.harness} is not installed on this host. No terminal was launched.`,
		});
	const commandId = input.commandId ?? crypto.randomUUID();
	if (
		input.continueSessionId &&
		!input.model &&
		!input.mode &&
		!input.attachmentIds?.length
	) {
		const previous = chat.commands.getSession({
			sessionId: input.continueSessionId,
		});
		const live = chat.live.get(input.continueSessionId);
		const continued = chatContinuationTarget(
			ctx.db,
			ctx.terminalAgentStore,
			chat.live,
			{
				...input,
				continueTerminalId: live?.terminalId,
			},
		);
		if (
			previous.live &&
			previous.session?.scopeId === input.workspaceId &&
			previous.session.harness === target.harness &&
			continued?.chatSessionId === input.continueSessionId
		) {
			if (input.prompt.trim())
				chat.commands.prompt({
					commandId,
					sessionId: input.continueSessionId,
					clientId: "superset-sessions",
					content: [{ type: "text", text: input.prompt }],
				});
			return {
				kind: "chat",
				sessionId: input.continueSessionId,
				terminalId:
					chat.live.get(input.continueSessionId)?.terminalId ??
					input.continueSessionId,
				label: target.label,
			};
		}
	}
	if (workspace.projectId === null) {
		const config = resolveHostAgentConfig(ctx.db, input.agent);
		if (config)
			await seedAgentFolderTrust(ctx.db, workspace.worktreePath, config);
	}
	return createChatSession(
		chat,
		target,
		{ ...input, commandId },
		workspace.worktreePath,
	);
}
