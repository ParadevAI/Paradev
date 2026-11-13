import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
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
import {
	buildChangeset,
	type ChangesetCheckout,
	type ChangesetFile,
} from "./utils/buildChangeset";

export type {
	ChangesetCheckout,
	ChangesetFile,
	ChangesetSource,
} from "./utils/buildChangeset";

export interface WorkspaceChangesetResult {
	files: ChangesetFile[];
	/** One per checkout; the files are also in `files`. */
	checkouts: ChangesetCheckout[];
	additions: number;
	deletions: number;
	/** The primary checkout's branches. */
	currentBranch: string | null;
	baseBranch: string | null;
	hostUrl: string | null;
	/** Answered or failed (or no reachable host). Gates empty states only. */
	isReady: boolean;
	refetch: () => Promise<unknown>;
}

const CHANGESET_STALE_MS = 15_000;
const CHANGESET_REFETCH_MS = 30_000;

export function getWorkspaceChangesetQueryKey(workspaceId: string | null) {
	return ["workspace-changeset", workspaceId] as const;
}

/**
 * The workspace's working-tree changeset, one `git.getStatus` per checkout,
 * each file tagged with the source category and repository that
 * `git.getDiff` expects.
 */
export function useWorkspaceChangeset(
	workspaceId: string | null,
): WorkspaceChangesetResult {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const queryClient = useQueryClient();
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	// Keyed by value: the row is a new object on every workspace list poll,
	// and a new target list would rebuild every file row.
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
				...getWorkspaceChangesetQueryKey(workspaceId),
				target.repositoryId,
			] as const,
			enabled: hostUrl !== null && workspaceId !== null,
			staleTime: CHANGESET_STALE_MS,
			refetchInterval: CHANGESET_REFETCH_MS,
			retry: 1,
			networkMode: "always" as const,
			queryFn: () => {
				if (!hostUrl || !workspaceId) throw new Error("Host is not resolved");
				return getHostServiceClientByUrl(hostUrl).git.getStatus.query({
					workspaceId,
					repositoryId: target.repositoryId ?? undefined,
					priority: "foreground",
				});
			},
		})),
	});
	const dataVersion = queries.map((query) => query.dataUpdatedAt).join(",");

	// biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion changes when any checkout's status lands.
	const changeset = useMemo(
		() =>
			buildChangeset(
				targets.map((target, index) => ({
					target,
					status: queries[index]?.data,
				})),
			),
		[targets, dataVersion],
	);

	const refetch = useCallback(
		() =>
			queryClient.refetchQueries({
				queryKey: getWorkspaceChangesetQueryKey(workspaceId),
			}),
		[queryClient, workspaceId],
	);

	const primary =
		changeset.checkouts.find((checkout) => checkout.isPrimary) ??
		changeset.checkouts[0];

	return {
		files: changeset.files,
		checkouts: changeset.checkouts,
		additions: changeset.additions,
		deletions: changeset.deletions,
		currentBranch: primary?.currentBranch ?? null,
		baseBranch: primary?.baseBranch ?? null,
		hostUrl,
		isReady:
			hostUrl === null ||
			(targets.length > 0 &&
				queries.every((query) => query.isSuccess || query.isError)),
		refetch,
	};
}
