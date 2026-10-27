import type { PRState } from "renderer/screens/main/components/PRIcon/PRIcon";

export interface WorkspacePullRequestSummary {
	url: string;
	number: number;
	title: string;
	state: PRState;
}

export function workspacePullRequests(
	current: WorkspacePullRequestSummary | null,
	associated: readonly WorkspacePullRequestSummary[] | undefined,
): WorkspacePullRequestSummary[] {
	const byUrl = new Map<string, WorkspacePullRequestSummary>();
	if (current) byUrl.set(current.url, current);
	for (const pr of associated ?? []) {
		if (!byUrl.has(pr.url)) byUrl.set(pr.url, pr);
	}
	return [...byUrl.values()];
}
