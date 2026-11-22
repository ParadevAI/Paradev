import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";

export interface WorkspaceStatusReport {
	status: PaneStatus | null;
	at: number | null;
}

/**
 * A workspace's attention status and unread state, from its terminals, the
 * user's manual unread mark, and the status a cloud box reports for itself.
 * A reported `review` the user has already seen no longer counts.
 */
export function deriveWorkspaceStatus({
	terminalStatuses,
	hasManualUnread,
	report,
	seenAt,
}: {
	terminalStatuses: Iterable<PaneStatus>;
	hasManualUnread: boolean;
	report?: WorkspaceStatusReport;
	seenAt: number | undefined;
}): { status: ActivePaneStatus | null; isUnread: boolean } {
	const statuses = [...terminalStatuses];
	const reported =
		report?.status === "review" &&
		report.at !== null &&
		(seenAt ?? 0) >= report.at
			? null
			: (report?.status ?? null);
	return {
		status: getHighestPriorityStatus([
			hasManualUnread ? "review" : undefined,
			reported ?? undefined,
			...statuses,
		]),
		isUnread:
			hasManualUnread ||
			statuses.some((status) => status === "review" || status === "failed") ||
			reported === "review" ||
			reported === "failed",
	};
}
