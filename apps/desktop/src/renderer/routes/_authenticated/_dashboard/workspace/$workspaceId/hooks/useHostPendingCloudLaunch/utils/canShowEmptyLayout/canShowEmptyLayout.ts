/**
 * Whether the workspace is known to have nothing to show. A sandbox may
 * still report a launch whose waiting pane is about to open, so its first
 * answer is part of knowing the layout.
 */
export function canShowEmptyLayout({
	isLayoutReady,
	isSandboxHost,
	pendingLaunchStatus,
}: {
	isLayoutReady: boolean;
	isSandboxHost: boolean;
	pendingLaunchStatus: "pending" | "success" | "error";
}): boolean {
	if (!isLayoutReady) return false;
	return !isSandboxHost || pendingLaunchStatus !== "pending";
}
