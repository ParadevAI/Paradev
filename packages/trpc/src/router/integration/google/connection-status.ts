/** The fields the status picker reads from a `connections` row. */
export interface GoogleConnectionStatusRow {
	id: string;
	externalAccountId: string | null;
	connectedByUserId: string | null;
	createdAt: Date;
	disconnectedAt: Date | null;
}

/**
 * The one row a member's Google status is shown for, from all of their Google
 * rows in an org, newest first. A member can hold more than one: a second
 * account, or a disconnected row left beside a live one. A live row wins over a
 * disconnected one, so a stale row does not turn a working account into
 * "Reconnect required"; among rows of the same kind the newest wins.
 */
export function pickGoogleStatusConnection<T extends GoogleConnectionStatusRow>(
	rowsNewestFirst: T[],
): T | null {
	return (
		rowsNewestFirst.find((row) => row.disconnectedAt === null) ??
		rowsNewestFirst[0] ??
		null
	);
}

export function googleConnectionStatus(
	rowsNewestFirst: GoogleConnectionStatusRow[],
) {
	const connection = pickGoogleStatusConnection(rowsNewestFirst);
	if (!connection) return null;
	return {
		id: connection.id,
		// The Google account's address; the connection is that person's
		// mailbox, not the organization's.
		email: connection.externalAccountId,
		connectedByUserId: connection.connectedByUserId,
		connectedAt: connection.createdAt,
		needsReconnect: connection.disconnectedAt !== null,
		// Every Google row this member holds in the org, so a client can tell
		// that more than one account is connected.
		accountCount: rowsNewestFirst.length,
	};
}
