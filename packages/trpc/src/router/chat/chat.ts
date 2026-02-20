import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";

const AVAILABLE_MODELS = [
	{
		id: "anthropic/claude-opus-4-6",
		name: "Opus 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		name: "Sonnet 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		name: "Haiku 4.5",
		provider: "Anthropic",
	},
];

const titleSchema = z.object({
	title: z
		.string()
		.describe(
			"A concise 2-5 word title for a coding chat session. Examples: 'Fix Auth Middleware', 'Drizzle Schema Migration', 'React State Refactor', 'WebSocket Setup'",
		),
});

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),

	generateTitle: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				messages: z
					.array(z.object({ role: z.string(), text: z.string() }))
					.max(20),
			}),
		)
		.mutation(async ({ input }) => {
			const digest = input.messages
				.map((m) => `${m.role}: ${m.text}`)
				.join("\n");

			const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
			const response = await client.messages.parse({
				model: "claude-haiku-4-5-20251001",
				max_tokens: 50,
				system:
					"You are a title generator for a coding assistant chat. Generate a concise 2-5 word title summarizing the conversation topic.",
				messages: [{ role: "user", content: digest }],
				output_config: { format: zodOutputFormat(titleSchema) },
			});

			const title = response.parsed_output?.title ?? "Untitled Chat";

			await db
				.update(chatSessions)
				.set({ title })
				.where(eq(chatSessions.id, input.sessionId));

			return { title };
		}),
} satisfies TRPCRouterRecord;
