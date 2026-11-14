import type { HostServiceClient } from "renderer/lib/host-service-client";

/**
 * Tells the host a workspace moves away from to start these terminals'
 * agents again, once their move ended without them leaving. Returns the ids
 * that did not start again: the host named them, or could not be reached.
 */
export async function releaseSourceTerminals(
	source: Pick<HostServiceClient, "teleport">,
	workspaceId: string,
	terminalIds: readonly string[],
): Promise<string[]> {
	if (terminalIds.length === 0) return [];
	try {
		const { failedTerminalIds } = await source.teleport.releaseTerminals.mutate(
			{ workspaceId, terminalIds: [...terminalIds] },
		);
		return failedTerminalIds ?? [];
	} catch (error) {
		console.warn(
			"[workspace-move] could not start the terminals that stayed",
			error,
		);
		return [...terminalIds];
	}
}
