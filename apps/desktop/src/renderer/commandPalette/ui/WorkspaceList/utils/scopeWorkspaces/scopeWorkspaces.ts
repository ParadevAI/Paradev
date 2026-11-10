import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { matchesCreator, type SwitcherQuery } from "../parseSwitcherQuery";

type ScopeInputs = Pick<
	AccessibleV2Workspace,
	"id" | "isInSidebar" | "createdByName"
>;

/** The current workspace stays in scope: it may have been opened from outside the sidebar. */
export function scopeWorkspaces<T extends ScopeInputs>(
	workspaces: T[],
	query: Pick<SwitcherQuery, "scope" | "creator">,
	currentId: string | null,
): T[] {
	return workspaces.filter((workspace) => {
		if (query.creator) {
			return matchesCreator(workspace.createdByName, query.creator);
		}
		if (query.scope === "all") return true;
		return workspace.isInSidebar || workspace.id === currentId;
	});
}
