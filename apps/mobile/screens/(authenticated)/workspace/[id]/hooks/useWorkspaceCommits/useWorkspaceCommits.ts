import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	type CheckoutTarget,
	checkoutTargets,
	rootCheckoutTarget,
} from "@/lib/host-service/checkouts";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { mergeCheckoutCommits } from "./utils/mergeCheckoutCommits";

const COMMITS_STALE_MS = 30_000;

export function getWorkspaceCommitsQueryKey(workspaceId: string | null) {
	return ["workspace-commits", workspaceId] as const;
}

/**
 * Commits on the workspace branch (base..HEAD) via host `git.listCommits`,
 * one call per checkout, newest first across them.
 */
export function useWorkspaceCommits(workspaceId: string | null) {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	// A cloud sandbox is addressed before it serves its row; ask its folder.
	const targetsKey = JSON.stringify(
		workspace
			? checkoutTargets(workspace)
			: hostUrl
				? [rootCheckoutTarget("")]
				: [],
	);
	const targets = useMemo(
		(): CheckoutTarget[] => JSON.parse(targetsKey),
		[targetsKey],
	);

	const queries = useQueries({
		queries: targets.map((target) => ({
			queryKey: [
				...getWorkspaceCommitsQueryKey(workspaceId),
				target.repositoryId,
			] as const,
			enabled: hostUrl !== null && workspaceId !== null,
			staleTime: COMMITS_STALE_MS,
			retry: 1,
			networkMode: "always" as const,
			queryFn: () => {
				if (!hostUrl || !workspaceId) throw new Error("Host is not resolved");
				return getHostServiceClientByUrl(hostUrl).git.listCommits.query({
					workspaceId,
					repositoryId: target.repositoryId ?? undefined,
				});
			},
		})),
	});
	const dataVersion = queries.map((query) => query.dataUpdatedAt).join(",");

	// biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion changes when any checkout's commits land.
	const commits = useMemo(
		() =>
			mergeCheckoutCommits(
				targets.map((target, index) => ({
					target,
					commits: queries[index]?.data?.commits ?? [],
				})),
			),
		[targets, dataVersion],
	);

	return {
		commits,
		hostUrl,
		isReady:
			hostUrl === null ||
			(targets.length > 0 &&
				queries.every((query) => query.isSuccess || query.isError)),
	};
}
