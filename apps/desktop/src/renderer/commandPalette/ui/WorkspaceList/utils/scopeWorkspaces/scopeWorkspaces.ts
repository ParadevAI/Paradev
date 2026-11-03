import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { matchesCreator, type SwitcherQuery } from "../parseSwitcherQuery";

type ScopeInputs = Pick<
	AccessibleV2Workspace,
	"id" | "isInSidebar" | "createdByName"
>;

/**
 * The workspaces a query reaches: the sidebar's by default (plus the one
 * you are in, which may have been opened from elsewhere), everyone's with
 * "#", and one person's with "#name".
 */
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
