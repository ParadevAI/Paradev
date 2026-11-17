type RevealState = "revealed" | "dismissed";

const states = new Map<string, RevealState>();

export function canAgentRevealSidebar(workspaceId: string): boolean {
	return states.get(workspaceId) !== "dismissed";
}

export function markAgentRevealedSidebar(workspaceId: string): void {
	states.set(workspaceId, "revealed");
}

/** A user who closes a sidebar an agent opened keeps it closed until they open it again. */
export function noteUserSidebarToggle(
	workspaceId: string,
	open: boolean,
): void {
	if (open) states.delete(workspaceId);
	else if (states.get(workspaceId) === "revealed")
		states.set(workspaceId, "dismissed");
}

export function clearAgentSidebarRevealsForTest(): void {
	states.clear();
}
