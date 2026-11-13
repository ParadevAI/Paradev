import type { WorkspacePullRequestHistory } from "./client";

export interface WorkspacePullRequest {
	/** Stable row key; the host rows have no client-facing id. */
	key: string;
	repositoryId: string;
	/** The checkout's folder name, or null when the workspace has one repository. */
	checkoutName: string | null;
	repoOwner: string;
	repoName: string;
	prNumber: number;
	url: string;
	title: string;
	state: "open" | "draft" | "merged" | "closed" | "queued";
	isDraft: boolean;
	headBranch: string;
	mergedAt: Date | null;
	linkedAt: number;
	/** The PR on its checkout's current branch — what the sidebar calls linked. */
	isCurrent: boolean;
}

type HistoryCheckout = WorkspacePullRequestHistory["checkouts"][number];

/** A host that predates checkouts serves one flat `pullRequests` list instead. */
type LegacyPullRequestHistory = {
	pullRequests?: HistoryCheckout["pullRequests"];
};

function historyByCheckout(
	history: WorkspacePullRequestHistory | undefined,
	checkouts: Array<{ repositoryId: string; isPrimary: boolean }>,
): HistoryCheckout[] {
	if (!history) return [];
	if (history.checkouts) return history.checkouts;
	const legacy = (history as LegacyPullRequestHistory).pullRequests;
	if (!legacy) return [];
	const primary =
		checkouts.find((checkout) => checkout.isPrimary) ?? checkouts[0];
	return [{ repositoryId: primary?.repositoryId ?? "", pullRequests: legacy }];
}

/**
 * One list across checkouts: every checkout's current PR first, the primary
 * checkout's leading, then the rest newest link first.
 */
export function flattenPullRequestHistory(
	history: WorkspacePullRequestHistory | undefined,
	checkouts: Array<{ repositoryId: string; name: string; isPrimary: boolean }>,
): WorkspacePullRequest[] {
	const historyCheckouts = historyByCheckout(history, checkouts);
	const several = historyCheckouts.length > 1;
	const checkoutById = new Map(
		checkouts.map((checkout) => [checkout.repositoryId, checkout]),
	);
	const rows = historyCheckouts.flatMap(({ repositoryId, pullRequests }) =>
		pullRequests.map(
			(entry): WorkspacePullRequest => ({
				key: `${entry.repoOwner}/${entry.repoName}#${entry.number}`,
				repositoryId,
				checkoutName: several
					? (checkoutById.get(repositoryId)?.name ?? entry.repoName)
					: null,
				repoOwner: entry.repoOwner,
				repoName: entry.repoName,
				prNumber: entry.number,
				url: entry.url,
				title: entry.title,
				state: entry.state,
				isDraft: entry.isDraft,
				headBranch: entry.headBranch,
				mergedAt: entry.mergedAt ? new Date(entry.mergedAt) : null,
				linkedAt: entry.linkedAt,
				isCurrent: entry.isCurrent,
			}),
		),
	);
	const isPrimary = (row: WorkspacePullRequest) =>
		checkoutById.get(row.repositoryId)?.isPrimary === true;
	const current = rows
		.filter((row) => row.isCurrent)
		.sort((a, b) => Number(isPrimary(b)) - Number(isPrimary(a)));
	const past = rows
		.filter((row) => !row.isCurrent)
		.sort((a, b) => b.linkedAt - a.linkedAt);
	return [...current, ...past];
}
