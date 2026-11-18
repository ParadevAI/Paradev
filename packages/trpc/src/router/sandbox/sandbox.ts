import type { TRPCRouterRecord } from "@trpc/server";
import { topUpSandboxSession } from "../../lib/sandbox";
import { sandboxProcedure } from "../../trpc";
import { isLiveStatus } from "../cloud-workspace/live";
import { recordSandboxAwake } from "../cloud-workspace/sandbox-expiry";

/** What a cloud workspace's box asks of the API about itself. */
export const sandboxRouter = {
	/** The box's agent is active: extend its running session to a full timeout. */
	keepalive: sandboxProcedure.mutation(async ({ ctx }) => {
		if (isLiveStatus(ctx.sandboxWorkspace.status)) {
			const session = await topUpSandboxSession(
				ctx.sandboxWorkspace.providerSandboxId,
			);
			if (session) {
				await recordSandboxAwake(ctx.sandboxWorkspace.id, session);
			}
		}
		return { success: true };
	}),
} satisfies TRPCRouterRecord;
