import type { TRPCRouterRecord } from "@trpc/server";
import { topUpSandboxSession } from "../../lib/sandbox";
import { sandboxProcedure } from "../../trpc";

/** What a cloud workspace's box asks of the API about itself. */
export const sandboxRouter = {
	/** The box's agent is active: extend its running session to a full timeout. */
	keepalive: sandboxProcedure.mutation(async ({ ctx }) => {
		if (ctx.sandboxWorkspace.status === "ready") {
			await topUpSandboxSession(ctx.sandboxWorkspace.providerSandboxId);
		}
		return { success: true };
	}),
} satisfies TRPCRouterRecord;
