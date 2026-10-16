/**
 * What the inbox badge shows: unread asks, plus each kind of update the
 * reader has not hidden. A workspace whose agent finished counts once, whether
 * this device noticed it, its agent pushed a card, or both.
 */
export function inboxBadgeCount({
	unreadAsks,
	unreadUpdates,
	unreadFinished,
	finishedHere,
	showUpdates,
	showFinished,
}: {
	unreadAsks: number;
	unreadUpdates: number;
	/** The workspace of each unread pushed "agent finished" card; null when the card names none. */
	unreadFinished: (string | null)[];
	/** Workspaces this device marks as finished and not yet opened. */
	finishedHere: string[];
	showUpdates: boolean;
	showFinished: boolean;
}): number {
	const workspaces = new Set(finishedHere);
	let loose = 0;
	for (const workspaceId of unreadFinished) {
		if (workspaceId) workspaces.add(workspaceId);
		else loose += 1;
	}
	return (
		unreadAsks +
		(showUpdates ? unreadUpdates : 0) +
		(showFinished ? workspaces.size + loose : 0)
	);
}
