import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { devProcedure } from "../../trpc";
import { sendChannelMessage } from "../channel/channel-message";

export const agentApiRouter = {
	// LEGACY(remove once the worker that posts through channelMessage.send is
	// deployed): the worker deploys after the API, so the running one still
	// posts its final answers here for a few minutes.
	postMessage: devProcedure
		.input(
			z.object({
				channelId: z.string().uuid(),
				body: z.string().max(40_000),
				threadRootId: z.string().uuid().nullish(),
				idempotencyKey: z.string().min(1).max(64).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			sendChannelMessage(ctx, {
				channelId: input.channelId,
				body: input.body,
				threadRootId: input.threadRootId,
				clientId: input.idempotencyKey ?? crypto.randomUUID(),
			}),
		),
} satisfies TRPCRouterRecord;
