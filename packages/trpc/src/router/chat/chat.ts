import type { TRPCRouterRecord } from "@trpc/server";
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

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),
} satisfies TRPCRouterRecord;
