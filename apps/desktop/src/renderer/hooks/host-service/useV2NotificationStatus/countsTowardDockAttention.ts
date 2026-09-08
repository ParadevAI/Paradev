import type { PaneStatus } from "shared/tabs-types";

export type DockAttentionWorkspaceType = "main" | "worktree" | "session";

/**
 * Whether a derived terminal status should bump the OS dock badge for a
 * workspace. Aligns with board `deriveBoardColumn` (#6506): a finished agent
 * alone (`review`) is review-worthy on main/worktree, but session workspaces
 * (automation/chat runs with no project checkout) land in Idle on the board —
 * so they must not badge the dock either. permission/failed still page for
 * every type (board → Needs attention).
 */
export function countsTowardDockAttention({
	status,
	workspaceType,
}: {
	status: PaneStatus | null | undefined;
	workspaceType: DockAttentionWorkspaceType | undefined;
}): boolean {
	if (status === "permission" || status === "failed") return true;
	if (status === "review") {
		// Unknown type stays counted (fail closed on missing cache); only an
		// explicit session is excluded, matching deriveBoardColumn's
		// `type !== "session"` gate.
		return workspaceType !== "session";
	}
	return false;
}
