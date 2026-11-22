import { isArchivedCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { isAfter } from "date-fns";
import { useCallback, useMemo } from "react";
import type { HostProjectItem } from "@/hooks/useHostProjects";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	type OrgPullRequest,
	usePullRequests,
} from "@/screens/(authenticated)/hooks/usePullRequests";
import { pullRequestStatus } from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import type { HomeListItem } from "../../types";
import { useCloudPullRequests } from "../useCloudPullRequests";

const STATUS_RANK = {
	open: 0,
	queued: 0,
	draft: 1,
	merged: 2,
	closed: 3,
} as const;

export function useRowPullRequests({
	projects,
	items,
}: {
	projects: readonly HostProjectItem[];
	items: readonly HomeListItem[];
}) {
	const pullRequests = usePullRequests();

	// Host projects do not know cloud repo ids, so a PR is matched by the
	// repo coordinates in its URL.
	const byRepoBranch = useMemo(() => {
		const best = new Map<string, OrgPullRequest>();
		for (const pullRequest of pullRequests) {
			const repoPrefix = pullRequest.url
				.toLowerCase()
				.replace(/pull\/\d+.*$/, "");
			const key = `${repoPrefix}::${pullRequest.headBranch}`;
			const existing = best.get(key);
			if (!existing) {
				best.set(key, pullRequest);
				continue;
			}
			const cmp =
				STATUS_RANK[pullRequestStatus(pullRequest)] -
				STATUS_RANK[pullRequestStatus(existing)];
			if (
				cmp < 0 ||
				(cmp === 0 && isAfter(pullRequest.updatedAt, existing.updatedAt))
			) {
				best.set(key, pullRequest);
			}
		}
		return best;
	}, [pullRequests]);

	const repoPrefixByProject = useMemo(
		() =>
			new Map(
				projects.map((project) => [
					project.id,
					project.repoOwner && project.repoName
						? `https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase()
						: null,
				]),
			),
		[projects],
	);

	const cloudPullRequests = useCloudPullRequests({
		active: items.some(
			(item) =>
				item.kind === "cloudRow" &&
				!isArchivedCloudWorkspaceStatus(item.row.status),
		),
		archived: items.some(
			(item) =>
				item.kind === "cloudRow" &&
				isArchivedCloudWorkspaceStatus(item.row.status),
		),
	});

	const hostPullRequest = useCallback(
		(workspace: HostWorkspaceItem) => {
			const repoPrefix = workspace.projectId
				? repoPrefixByProject.get(workspace.projectId)
				: undefined;
			return repoPrefix
				? byRepoBranch.get(`${repoPrefix}::${workspace.branch}`)
				: undefined;
		},
		[repoPrefixByProject, byRepoBranch],
	);
	const cloudPullRequest = useCallback(
		(workspaceId: string) => cloudPullRequests.get(workspaceId)?.[0],
		[cloudPullRequests],
	);

	return { hostPullRequest, cloudPullRequest };
}
