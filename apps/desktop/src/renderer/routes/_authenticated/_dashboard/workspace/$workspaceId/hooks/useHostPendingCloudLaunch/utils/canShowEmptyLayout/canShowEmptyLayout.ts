import type { WorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";

/**
 * Whether the workspace is known to have nothing to show. Only a sandbox
 * can report a launch whose waiting pane is about to open, so its first
 * answer is part of knowing the layout, and so is knowing the host kind.
 */
export function canShowEmptyLayout({
	isLayoutReady,
	hostTarget,
	pendingLaunchStatus,
}: {
	isLayoutReady: boolean;
	hostTarget: WorkspaceHostTarget;
	pendingLaunchStatus: "pending" | "success" | "error";
}): boolean {
	if (!isLayoutReady) return false;
	switch (hostTarget.status) {
		case "loading":
			return false;
		case "not-found":
		case "local-starting":
			return true;
		case "ready":
			return hostTarget.kind !== "sandbox" || pendingLaunchStatus !== "pending";
		default:
			return hostTarget satisfies never;
	}
}
