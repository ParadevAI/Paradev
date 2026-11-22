import type { CloudUsageRow, WorkspaceRef } from "../../types";

/** A workspace row's ref, or null when the workspace is gone. */
export function workspaceOf(row: CloudUsageRow): WorkspaceRef | null {
	return row.ref && "status" in row.ref ? row.ref : null;
}
