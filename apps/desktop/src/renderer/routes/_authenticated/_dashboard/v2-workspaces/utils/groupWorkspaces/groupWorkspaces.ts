import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import type {
	V2WorkspacesGroupBy,
	V2WorkspacesOrderBy,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
	deriveBoardColumn,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import {
	compareWorkspacesBy,
	workspaceActivityAt,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";

/** Board order reads left-to-right along the workflow; a vertical list must
 * lead with what needs the user, so it walks the same buckets urgency-first. */
export const LIST_STATUS_ORDER: BoardColumnKey[] = [
	"attention",
	"working",
	"finished",
	"review",
	"idle",
	"merged",
	"deleted",
];

export const GROUP_KEY_SESSIONS = "__sessions__";
export const GROUP_KEY_UNKNOWN_CREATOR = "__unknown__";
export const GROUP_KEY_CLOUD = "__cloud__";
/** Archived tombstones under any non-status grouping; status has its own buckets. */
export const GROUP_KEY_ARCHIVED = "__archived__";

export interface WorkspaceSection {
	groupBy: V2WorkspacesGroupBy;
	/** Stable within a grouping: a status column, project id, host id or user id. */
	key: string;
	/** Set for status grouping; the header renders the column's label and icon. */
	column: BoardColumnKey | null;
	/** Any member — the header takes its name, icon or avatar from here. */
	sample: AccessibleV2Workspace;
	workspaces: AccessibleV2Workspace[];
	/** Newest activity across the section, whatever order its rows take. */
	latestActivityAt: number;
}

interface GroupWorkspacesOptions {
	groupBy: V2WorkspacesGroupBy;
	orderBy: V2WorkspacesOrderBy;
	showArchived: boolean;
}

function groupKey(
	workspace: AccessibleV2Workspace,
	groupBy: V2WorkspacesGroupBy,
): string {
	switch (groupBy) {
		case "status":
			return deriveBoardColumn(workspace);
		case "project":
			return workspace.projectId ?? GROUP_KEY_SESSIONS;
		case "where":
			return workspace.hostType === "cloud"
				? GROUP_KEY_CLOUD
				: workspace.hostId;
		case "creator":
			return workspace.createdByUserId ?? GROUP_KEY_UNKNOWN_CREATOR;
		default:
			return "all";
	}
}

/** Section order for non-status groupings: by each section's newest row, so
 * the busiest project or person leads; the catch-all buckets go last. */
function compareSections(a: WorkspaceSection, b: WorkspaceSection): number {
	const rank = (key: string) =>
		key === GROUP_KEY_ARCHIVED
			? 2
			: key === GROUP_KEY_SESSIONS || key === GROUP_KEY_UNKNOWN_CREATOR
				? 1
				: 0;
	if (rank(a.key) !== rank(b.key)) return rank(a.key) - rank(b.key);
	return b.latestActivityAt - a.latestActivityAt;
}

/** Same buckets as the board under status grouping — the two views must
 * agree on what "needs attention" means. */
export function groupWorkspaces(
	workspaces: AccessibleV2Workspace[],
	{ groupBy, orderBy, showArchived }: GroupWorkspacesOptions,
): WorkspaceSection[] {
	const byKey = new Map<string, AccessibleV2Workspace[]>();
	if (groupBy === "status") {
		for (const column of BOARD_COLUMN_ORDER) byKey.set(column, []);
	}
	for (const workspace of workspaces) {
		if (workspace.archivedAt != null && !showArchived) continue;
		const key =
			workspace.archivedAt != null && groupBy !== "status"
				? GROUP_KEY_ARCHIVED
				: groupKey(workspace, groupBy);
		const rows = byKey.get(key);
		if (rows) rows.push(workspace);
		else byKey.set(key, [workspace]);
	}
	const compare = compareWorkspacesBy(orderBy);
	const sections: WorkspaceSection[] = [];
	const keys = groupBy === "status" ? LIST_STATUS_ORDER : [...byKey.keys()];
	for (const key of keys) {
		const rows = byKey.get(key) ?? [];
		if (rows.length === 0) continue;
		const latestActivityAt = Math.max(...rows.map(workspaceActivityAt));
		rows.sort(compare);
		sections.push({
			groupBy,
			key,
			column: groupBy === "status" ? (key as BoardColumnKey) : null,
			sample: rows[0],
			workspaces: rows,
			latestActivityAt,
		});
	}
	if (groupBy !== "status") sections.sort(compareSections);
	return sections;
}
