import type { PendingCloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";

export interface PendingLaunchHostClient {
	sandbox: {
		pendingLaunch: {
			query(input: {
				workspaceId: string;
			}): Promise<PendingCloudAgentLaunch | null>;
		};
	};
}

/** A host older than `sandbox.pendingLaunch` has no launch to report. */
export async function fetchPendingCloudLaunch(
	client: PendingLaunchHostClient,
	workspaceId: string,
): Promise<PendingCloudAgentLaunch | null> {
	try {
		return await client.sandbox.pendingLaunch.query({ workspaceId });
	} catch (error) {
		if (isMissingProcedureError(error)) return null;
		throw error;
	}
}
