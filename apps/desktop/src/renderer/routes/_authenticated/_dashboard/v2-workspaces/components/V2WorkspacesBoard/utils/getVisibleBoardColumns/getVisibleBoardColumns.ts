import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

const ARCHIVED_COLUMNS = new Set<BoardColumnKey>(["merged", "deleted"]);

export function getVisibleBoardColumns(
	showArchived: boolean,
	workspaceCount: (column: BoardColumnKey) => number,
): BoardColumnKey[] {
	return BOARD_COLUMN_ORDER.filter(
		(column) =>
			showArchived ||
			!ARCHIVED_COLUMNS.has(column) ||
			workspaceCount(column) > 0,
	);
}
