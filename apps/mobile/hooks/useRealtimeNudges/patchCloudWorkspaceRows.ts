import type { RealtimeUpdate } from "@superset/shared/realtime";
import type { CloudWorkspaceRow } from "../useCloudWorkspaces";

const isNewerStatus = (row: CloudWorkspaceRow, at: number) =>
	row.agentStatusAt === null || at >= new Date(row.agentStatusAt).getTime();

export function patchCloudWorkspaceRows(
	rows: CloudWorkspaceRow[],
	updates: readonly RealtimeUpdate[],
): CloudWorkspaceRow[] {
	return rows.map((row) => {
		const update = updates.find((u) => u.workspaceId === row.id);
		if (!update) return row;
		if (!isNewerStatus(row, update.agentStatusAt)) return row;
		return {
			...row,
			agentStatus: update.agentStatus,
			agentStatusAt: new Date(update.agentStatusAt),
		};
	});
}
