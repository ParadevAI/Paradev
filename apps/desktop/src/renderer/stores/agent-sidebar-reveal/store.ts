type SidebarState = "agent-browsing" | "dismissed";

const states = new Map<string, SidebarState>();

export function canAgentRevealSidebar(workspaceId: string): boolean {
	return states.get(workspaceId) !== "dismissed";
}

export function markAgentBrowsingSidebar(workspaceId: string): void {
	if (states.get(workspaceId) !== "dismissed")
		states.set(workspaceId, "agent-browsing");
}

/** A user who closes a sidebar an agent is browsing in keeps it closed until they open it again. */
export function noteUserSidebarChange(
	workspaceId: string,
	open: boolean,
): void {
	if (open) states.delete(workspaceId);
	else if (states.get(workspaceId) === "agent-browsing")
		states.set(workspaceId, "dismissed");
}

export function forgetAgentSidebar(workspaceId: string): void {
	states.delete(workspaceId);
}

export function clearAgentSidebarStatesForTest(): void {
	states.clear();
}
