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
import { seedWorkspaceAgentTrust } from "../workspace-creation/shared/seed-agent-trust";
import { createChatSession } from "./create-chat-session";
import { sessionsClientId } from "./utils/sessionsClientId";

export const createChatSessionSchema = z
	.object({
		workspaceId: z.string().uuid(),
		agent: z.string().min(1),
		prompt: z.string().default(""),
		model: z.string().min(1).optional(),
		effort: z.string().min(1).optional(),
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

function isStopped(chat: ChatRuntime, sessionId: string): boolean {
	const live = chat.live.get(sessionId);
	return !live || live.state.status === "dead";
}

type StoredChatSession = NonNullable<
	ReturnType<ChatRuntime["commands"]["getSession"]>["session"]
>;

/**
 * The chat that carries this chat's conversation now: the chat itself, or the
 * open one that took the conversation over after it stopped.
 */
export function conversationChat(
	chat: ChatRuntime,
	session: StoredChatSession,
): StoredChatSession {
	if (!session.harnessSessionId || !isStopped(chat, session.sessionId))
		return session;
	const successors = chat.sessions
		.listByScope(session.scopeId)
		.filter(
			(other) =>
				other.sessionId !== session.sessionId &&
				!other.closedAt &&
				other.harness === session.harness &&
				other.harnessSessionId === session.harnessSessionId,
		);
	const running = successors.find((other) => !isStopped(chat, other.sessionId));
	if (running) return running;
	return session.closedAt ? (successors[0] ?? session) : session;
}

/**
 * Starts a stopped chat's agent again under the same chat, on the conversation
 * and agent config it had. Takes the chat `conversationChat` names, so no other
 * chat runs the conversation. Null when nothing was saved to start from.
 */
export async function restartStoppedChat(
	ctx: SessionContext,
	session: StoredChatSession,
	terminalId: string = crypto.randomUUID(),
): Promise<{ sessionId: string; terminalId: string } | null> {
	const chat = requireChatRuntime(ctx);
	const { sessionId, harnessSessionId } = session;
	if (!harnessSessionId || !isStopped(chat, sessionId)) return null;
	if (!chat.commands.getSession({ sessionId }).cursor?.seq) return null;

	const workspace = requireSessionWorkspace(ctx, session.scopeId);
	const config = session.agentConfigId
		? resolveHostAgentConfig(ctx.db, session.agentConfigId)
		: null;
	if (config) await seedWorkspaceAgentTrust(ctx.db, workspace, config);
	chat.commands.continueSession({
		sessionId,
		cwd: workspace.worktreePath,
		harnessSessionId,
		...(session.agentConfigId ? { agentConfigId: session.agentConfigId } : {}),
		terminalId,
	});
	return {
		sessionId,
		terminalId: chat.live.get(sessionId)?.terminalId ?? sessionId,
	};
}

/** `launch.terminalId` is host-internal: the id a cloud launch was promised. */
export async function createChatSessionInWorkspace(
	ctx: SessionContext,
	rawInput: CreateChatSessionInput,
	launch: { terminalId?: string; withoutAgentConfig?: boolean } = {},
): Promise<ChatSessionResult> {
	const input = createChatSessionSchema.parse(rawInput);
	const workspace = requireSessionWorkspace(ctx, input.workspaceId);
	seedDefaultsIfEmpty(ctx.db);
	const resolved = chatLaunchTarget(ctx.db, {
		workspaceId: input.workspaceId,
		agent: input.agent,
		prompt: input.prompt,
		surface: "chat",
		model: input.model,
		attachmentIds: input.attachmentIds,
	});
	const target =
		resolved && launch.withoutAgentConfig
			? { ...resolved, agentConfigId: null }
			: resolved;
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
	const continued = input.continueSessionId
		? await continueChat(ctx, input, target, launch.terminalId)
		: null;
	if (continued) {
		if (input.prompt.trim())
			chat.commands.prompt({
				commandId,
				sessionId: continued.sessionId,
				clientId: sessionsClientId(commandId),
				content: [{ type: "text", text: input.prompt }],
			});
		return { kind: "chat", ...continued, label: target.label };
	}
	const config = resolveHostAgentConfig(ctx.db, input.agent);
	if (config) await seedWorkspaceAgentTrust(ctx.db, workspace, config);
	return createChatSession(
		chat,
		target,
		{ ...input, commandId },
		workspace.worktreePath,
		launch.terminalId,
	);
}

/**
 * The chat to send this launch's prompt to instead of starting one: the chat
 * `continueSessionId` names, or the one that took over its conversation, as it
 * runs or started again. Null when the launch asks for something only a new
 * chat can honour, or that chat is closed.
 */
async function continueChat(
	ctx: SessionContext,
	input: z.output<typeof createChatSessionSchema>,
	target: { harness: string; agentConfigId?: string | null },
	terminalId: string | undefined,
): Promise<{ sessionId: string; terminalId: string } | null> {
	if (
		!input.continueSessionId ||
		input.model ||
		input.effort ||
		input.mode ||
		input.attachmentIds?.length
	) {
		return null;
	}
	const chat = requireChatRuntime(ctx);
	const named = chat.commands.getSession({
		sessionId: input.continueSessionId,
	}).session;
	if (
		!named ||
		named.scopeId !== input.workspaceId ||
		named.harness !== target.harness
	) {
		return null;
	}
	const session = conversationChat(chat, named);
	const { sessionId } = session;
	if (isStopped(chat, sessionId)) {
		const sameConfig =
			(session.agentConfigId ?? null) === (target.agentConfigId ?? null);
		return session.closedAt || !sameConfig
			? null
			: restartStoppedChat(ctx, session, terminalId);
	}
	const running = chatContinuationTarget(
		ctx.db,
		ctx.terminalAgentStore,
		chat.live,
		{ ...input, continueTerminalId: chat.live.get(sessionId)?.terminalId },
	);
	return running?.chatSessionId === sessionId
		? { sessionId, terminalId: running.terminalId }
		: null;
}
