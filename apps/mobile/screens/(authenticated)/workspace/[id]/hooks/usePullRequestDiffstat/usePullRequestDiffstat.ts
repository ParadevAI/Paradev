import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { WorkspacePullRequest } from "../useWorkspacePullRequest";

export interface PullRequestDiffstat {
	additions: number;
	deletions: number;
}

/**
 * The host's PR history carries no per-PR detail, so the diffstat is fetched
 * per pull request. Null until the numbers exist.
 */
export function usePullRequestDiffstat({
	hostUrl,
	pullRequest,
	enabled = true,
}: {
	hostUrl: string | null;
	pullRequest: WorkspacePullRequest | undefined;
	enabled?: boolean;
}): PullRequestDiffstat | null {
	const { data } = useQuery({
		queryKey: ["pull-request-diffstat", hostUrl, pullRequest?.key],
		enabled: enabled && hostUrl !== null && pullRequest !== undefined,
		staleTime: 5 * 60_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl || !pullRequest) return null;
			const pr = await getHostServiceClientByUrl(hostUrl).github.getPR.query({
				owner: pullRequest.repoOwner,
				repo: pullRequest.repoName,
				pullNumber: pullRequest.prNumber,
			});
			return { additions: pr.additions, deletions: pr.deletions };
		},
	});
	return data ?? null;
}
