import type { cloudWorkspaces } from "@superset/db/schema";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

/** The plan's per-session cap; a row without `sessionEndsAt` last booted before it was recorded. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

function sessionEnded(row: CloudWorkspaceRow, now: number): boolean {
	if (row.sessionEndsAt) return row.sessionEndsAt.getTime() <= now;
	return (
		row.agentStatusAt !== null &&
		now - row.agentStatusAt.getTime() > MAX_SESSION_MS
	);
}

/**
 * A row as clients see it. A box that stopped mid-turn never reported the
 * turn's end, so a working or permission status it left shows as none.
 */
export function listedWorkspace(
	row: CloudWorkspaceRow,
	now = Date.now(),
): Omit<CloudWorkspaceRow, "sessionEndsAt"> {
	const { sessionEndsAt: _sessionEndsAt, ...listed } = row;
	const cutOff =
		(row.agentStatus === "working" || row.agentStatus === "permission") &&
		sessionEnded(row, now);
	return cutOff ? { ...listed, agentStatus: null } : listed;
}
