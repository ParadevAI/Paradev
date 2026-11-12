import type { HostServiceClient } from "renderer/lib/host-service-client";

/**
 * Tells the host a workspace moves away from to start these terminals'
 * agents again, once their move ended without them leaving.
 */
export async function releaseSourceTerminals(
	source: Pick<HostServiceClient, "teleport">,
	workspaceId: string,
	terminalIds: readonly string[],
): Promise<void> {
	if (terminalIds.length === 0) return;
	await source.teleport.releaseTerminals
		.mutate({ workspaceId, terminalIds: [...terminalIds] })
		.catch((error: unknown) =>
			console.warn(
				"[workspace-move] could not start the terminals that stayed",
				error,
			),
		);
}
