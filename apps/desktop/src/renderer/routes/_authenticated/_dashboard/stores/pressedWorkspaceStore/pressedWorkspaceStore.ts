import { useCallback, useSyncExternalStore } from "react";

let pressedWorkspaceId: string | null = null;
const listeners = new Set<() => void>();

/** The workspace the pointer went down on, ahead of the route change. */
export function setPressedWorkspaceId(workspaceId: string | null): void {
	if (pressedWorkspaceId === workspaceId) return;
	pressedWorkspaceId = workspaceId;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Whether a sidebar row shows as active: the pressed row while a press is
 *  pending, else the routed one. Only rows whose answer changes re-render. */
export function useIsWorkspaceShownActive(
	workspaceId: string,
	isRouteActive: boolean,
): boolean {
	const getSnapshot = useCallback(
		() =>
			pressedWorkspaceId === null
				? isRouteActive
				: pressedWorkspaceId === workspaceId,
		[workspaceId, isRouteActive],
	);
	return useSyncExternalStore(subscribe, getSnapshot);
}
