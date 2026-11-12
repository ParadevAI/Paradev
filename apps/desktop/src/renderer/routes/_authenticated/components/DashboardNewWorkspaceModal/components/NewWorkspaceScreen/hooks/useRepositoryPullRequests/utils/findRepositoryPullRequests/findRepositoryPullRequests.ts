import type {
	LinkedPR,
	RepositoryPullRequest,
} from "renderer/stores/new-workspace-draft";

interface SearchRow {
	prNumber: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	headRefName: string | null;
	repositoryProjectId?: string;
}

export type SearchProjectPullRequests = (
	query: string,
) => Promise<{ pullRequests: SearchRow[] }>;

/**
 * The repository a multi-repo project's PR belongs to, plus each other
 * repository's open PR on the same head branch. Null when no repository holds it.
 */
export async function findRepositoryPullRequests(
	search: SearchProjectPullRequests,
	linkedPR: LinkedPR,
): Promise<Record<string, RepositoryPullRequest> | null> {
	const { pullRequests } = await search(`#${linkedPR.prNumber}`);
	const picked = pullRequests.find((row) => sameUrl(row.url, linkedPR.url));
	if (!picked?.repositoryProjectId) return null;
	const headRefName = picked.headRefName ?? "";
	const result: Record<string, RepositoryPullRequest> = {
		[picked.repositoryProjectId]: { ...linkedPR, headRefName, matched: false },
	};
	if (!headRefName) return result;

	const siblings = await search(`head:${headRefName}`);
	for (const row of siblings.pullRequests) {
		const repositoryId = row.repositoryProjectId;
		if (!repositoryId || result[repositoryId] || row.state !== "open") continue;
		if ((row.headRefName ?? headRefName) !== headRefName) continue;
		result[repositoryId] = {
			prNumber: row.prNumber,
			title: row.title,
			url: row.url,
			state: row.isDraft ? "draft" : row.state,
			headRefName,
			matched: true,
		};
	}
	return result;
}

function sameUrl(a: string, b: string): boolean {
	return (
		a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase()
	);
}
