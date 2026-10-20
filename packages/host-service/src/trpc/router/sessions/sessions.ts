import { presetForAcpHarness } from "@superset/chat/core";
import { cursorSchema } from "@superset/chat/protocol";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { chatLaunchTarget } from "../agents/agents";
import { seedDefaultsIfEmpty } from "../settings/agent-configs";
import { scopedCommandId } from "./scoped-command-id";
import {
	createChatSessionInWorkspace,
	createChatSessionSchema,
	requireChatRuntime,
	requireChatSession,
	requireSessionWorkspace,
} from "./session-service";

async function chatEnabled(
	ctx: Pick<HostServiceContext, "api" | "userId">,
): Promise<boolean> {
	try {
		const result = await ctx.api.analytics.acpChatEnabled.query({
			...(ctx.userId ? { userId: ctx.userId } : {}),
		});
		return result.enabled;
	} catch (error) {
		throw new TRPCError({
			code: "SERVICE_UNAVAILABLE",
			message:
				"Could not verify ACP chat access. Check the API connection and API version.",
			cause: error,
		});
	}
}

const sessionProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (!(await chatEnabled(ctx)))
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"ACP chat sessions require the acp-chat feature flag. Check flag access and update the API if needed. No terminal was launched.",
		});
	return next({ ctx });
});
const sessionInput = z.object({
	workspaceId: z.string().uuid(),
	sessionId: z.string().min(1),
});

export const sessionsRouter = router({
	capabilities: protectedProcedure
		.input(z.object({ agent: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			seedDefaultsIfEmpty(ctx.db);
			const target = chatLaunchTarget(ctx.db, {
				workspaceId: "",
				agent: input.agent,
				prompt: "",
				surface: "chat",
			});
			return {
				enabled: await chatEnabled(ctx),
				supported:
					!!target && !!ctx.runtime.chat?.()?.live.supports(target.harness),
			};
		}),
	create: sessionProcedure
		.input(createChatSessionSchema)
		.mutation(({ ctx, input }) => createChatSessionInWorkspace(ctx, input)),
	list: sessionProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				limit: z.number().int().positive().max(200).default(50),
			}),
		)
		.query(({ ctx, input }) => {
			requireSessionWorkspace(ctx, input.workspaceId);
			return requireChatRuntime(ctx)
				.commands.listSessions({
					scopeId: input.workspaceId,
					limit: input.limit,
				})
				.filter((session) => presetForAcpHarness(session.harness));
		}),
	get: sessionProcedure.input(sessionInput).query(({ ctx, input }) => {
		const { chat: _chat, ...result } = requireChatSession(
			ctx,
			input.workspaceId,
			input.sessionId,
		);
		return result;
	}),
	read: sessionProcedure
		.input(
			sessionInput.extend({
				limit: z.number().int().positive().max(500).default(200),
				before: cursorSchema.optional(),
			}),
		)
		.query(({ ctx, input }) => {
			const { chat } = requireChatSession(
				ctx,
				input.workspaceId,
				input.sessionId,
			);
			return chat.commands.getItems({
				sessionId: input.sessionId,
				limit: input.limit,
				before: input.before,
			});
		}),
	send: sessionProcedure
		.input(
			sessionInput.extend({
				prompt: z.string().min(1),
				commandId: z.string().uuid().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const { chat, live } = requireChatSession(
				ctx,
				input.workspaceId,
				input.sessionId,
			);
			if (!live || chat.live.get(input.sessionId)?.state.status === "dead")
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"This chat session is stopped. Resume it before sending a prompt.",
				});
			return chat.commands.prompt({
				commandId: scopedCommandId(
					`prompt:${input.sessionId}`,
					input.commandId,
				),
				sessionId: input.sessionId,
				clientId: "superset-sessions",
				content: [{ type: "text", text: input.prompt }],
			});
		}),
	close: sessionProcedure.input(sessionInput).mutation(({ ctx, input }) => {
		const { chat } = requireChatSession(
			ctx,
			input.workspaceId,
			input.sessionId,
		);
		return chat.commands.closeSession({ sessionId: input.sessionId });
	}),
	resume: sessionProcedure
		.input(sessionInput.extend({ commandId: z.string().uuid().optional() }))
		.mutation(async ({ ctx, input }) => {
			const { chat, session, live } = requireChatSession(
				ctx,
				input.workspaceId,
				input.sessionId,
			);
			const presetId = presetForAcpHarness(session.harness);
			if (!presetId)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This provider does not support ACP chat.",
				});
			if (live && chat.live.get(session.sessionId)?.state.status !== "dead")
				return {
					kind: "chat" as const,
					sessionId: session.sessionId,
					terminalId:
						chat.live.get(session.sessionId)?.terminalId ?? session.sessionId,
					label: presetId,
				};
			if (!session.harnessSessionId)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This chat has no saved provider session to resume.",
				});
			return createChatSessionInWorkspace(ctx, {
				workspaceId: input.workspaceId,
				agent: presetId,
				resumeSessionId: session.harnessSessionId,
				commandId: input.commandId,
			});
		}),
});
