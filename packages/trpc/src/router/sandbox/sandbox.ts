import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { keepaliveWindowMs, topUpSandboxSession } from "../../lib/sandbox";
import { sandboxProcedure } from "../../trpc";
import { isLiveStatus } from "../cloud-workspace/live";
import { recordSandboxAwake } from "../cloud-workspace/sandbox-expiry";

/** What a cloud workspace's box asks of the API about itself. */
export const sandboxRouter = {
	/** The box's agent is active: extend its running session past its next ping. */
	keepalive: sandboxProcedure
		.input(
			z
				.object({ pingsEveryMs: z.number().int().positive().optional() })
				.optional(),
		)
		.mutation(async ({ ctx, input }) => {
			if (isLiveStatus(ctx.sandboxWorkspace.status)) {
				const session = await topUpSandboxSession(
					ctx.sandboxWorkspace.providerSandboxId,
					keepaliveWindowMs(input?.pingsEveryMs),
				);
				if (session) {
					await recordSandboxAwake(ctx.sandboxWorkspace.id, session);
				}
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
