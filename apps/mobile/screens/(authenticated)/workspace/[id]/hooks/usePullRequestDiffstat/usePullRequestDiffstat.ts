import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { WorkspacePullRequest } from "../useWorkspacePullRequest";

/**
 * The host's history rows carry no per-PR detail, so the diffstat is one
 * GitHub call per pull request, cached across the dock chip and the sheet.
 */
export function usePullRequestDiffstat({
	hostUrl,
	pullRequest,
	enabled = true,
}: {
	hostUrl: string | null;
	pullRequest: WorkspacePullRequest | null;
	enabled?: boolean;
}) {
	const { data } = useQuery({
		queryKey: ["pull-request-diffstat", hostUrl, pullRequest?.key],
		enabled: enabled && hostUrl !== null && pullRequest !== null,
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
