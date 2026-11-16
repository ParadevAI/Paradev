import { isLiveCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import type { TRPCRouterRecord } from "@trpc/server";
import { topUpSandboxSession } from "../../lib/sandbox";
import { sandboxProcedure } from "../../trpc";
import { recordSandboxAwake } from "../cloud-workspace/sandbox-expiry";

/** What a cloud workspace's box asks of the API about itself. */
export const sandboxRouter = {
	/** The box's agent is active: extend its running session to a full timeout. */
	keepalive: sandboxProcedure.mutation(async ({ ctx }) => {
		if (isLiveCloudWorkspaceStatus(ctx.sandboxWorkspace.status)) {
			const session = await topUpSandboxSession(
				ctx.sandboxWorkspace.providerSandboxId,
			);
			if (session) {
				await recordSandboxAwake(ctx.sandboxWorkspace.id, session.expiresAt);
			}
		}
		return { success: true };
	}),
} satisfies TRPCRouterRecord;
