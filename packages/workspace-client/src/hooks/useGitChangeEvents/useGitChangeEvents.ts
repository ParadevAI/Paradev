import { useEffect, useEffectEvent } from "react";
import { getEventBus } from "../../lib/eventBus";
import { useWorkspaceClient } from "../../providers/WorkspaceClientProvider";

/**
 * Subscribe to `git:changed` events for a specific workspace (or all workspaces with "*").
 * Calls `onChanged` with the workspace ID whenever git state changes.
 */
export function useGitChangeEvents(
	workspaceId: string | "*",
	onChanged: (workspaceId: string) => void,
	enabled = true,
): void {
	const { hostUrl, getWsToken } = useWorkspaceClient();
	const handler = useEffectEvent(onChanged);

	useEffect(() => {
		if (!enabled) return;

		const bus = getEventBus(hostUrl, getWsToken);
		return bus.on("git:changed", workspaceId, (id) => {
			handler(id);
		});
	}, [hostUrl, getWsToken, workspaceId, enabled]);
}
