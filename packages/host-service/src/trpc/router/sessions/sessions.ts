import { presetForAcpHarness } from "@superset/chat/core";
import { cursorSchema } from "@superset/chat/protocol";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { chatLaunchTarget } from "../agents/agents";
import { seedDefaultsIfEmpty } from "../settings/agent-configs";
import {
	createChatSessionInWorkspace,
	createChatSessionSchema,
	requireChatRuntime,
	requireChatSession,
	requireSessionWorkspace,
} from "./session-service";

const sessionInput = z.object({
	workspaceId: z.string().uuid(),
	sessionId: z.string().min(1),
});

export const sessionsRouter = router({
	capabilities: protectedProcedure
		.input(z.object({ agent: z.string().min(1) }))
		.query(({ ctx, input }) => {
			seedDefaultsIfEmpty(ctx.db);
			const target = chatLaunchTarget(ctx.db, {
				workspaceId: "",
				agent: input.agent,
				prompt: "",
				surface: "chat",
			});
			return {
				supported:
					!!target && !!ctx.runtime.chat?.()?.live.supports(target.harness),
			};
		}),
	create: protectedProcedure
		.input(createChatSessionSchema)
		.mutation(({ ctx, input }) => createChatSessionInWorkspace(ctx, input)),
	list: protectedProcedure
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
	get: protectedProcedure.input(sessionInput).query(({ ctx, input }) => {
		const { chat: _chat, ...result } = requireChatSession(
			ctx,
			input.workspaceId,
			input.sessionId,
		);
		return result;
	}),
	read: protectedProcedure
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
	send: protectedProcedure
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
				commandId: input.commandId ?? crypto.randomUUID(),
				sessionId: input.sessionId,
				clientId: "superset-sessions",
				content: [{ type: "text", text: input.prompt }],
			});
		}),
	close: protectedProcedure.input(sessionInput).mutation(({ ctx, input }) => {
		const { chat } = requireChatSession(
			ctx,
			input.workspaceId,
			input.sessionId,
		);
		return chat.commands.closeSession({ sessionId: input.sessionId });
	}),
	resume: protectedProcedure
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
