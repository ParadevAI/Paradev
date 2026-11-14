import type { HostServiceClient } from "renderer/lib/host-service-client";

/**
 * Tells the host a workspace moves away from to stop sending these chats'
 * history to the cloud, once their move ended without them leaving.
 */
export async function releaseSourceChats(
	source: Pick<HostServiceClient, "teleport">,
	chatSessionIds: readonly string[],
): Promise<void> {
	if (chatSessionIds.length === 0) return;
	await source.teleport.releaseChats
		.mutate({ chatSessionIds: [...chatSessionIds] })
		.catch((error: unknown) =>
			console.warn(
				"[workspace-move] could not tell the source to stop following chats",
				error,
			),
		);
}
