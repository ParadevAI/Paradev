import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { useAreCheckoutsLoaded } from "../../state/activeRepositoryStore";
import { useChangesFilter } from "../../state/repositoryChangesFilterStore";
import { checkoutInput } from "../../utils/checkoutInput";
import type { DiffRef } from "../useChangeset/types";

export function useSidebarDiffRef(
	workspaceId: string,
	repositoryId: string | undefined,
): DiffRef {
	const filter = useChangesFilter(workspaceId, repositoryId);

	const checkoutsLoaded = useAreCheckoutsLoaded(workspaceId);
	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		checkoutInput(workspaceId, repositoryId),
		{ enabled: checkoutsLoaded, staleTime: Number.POSITIVE_INFINITY },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const filterKind = filter.kind;
	const commitHash =
		filter.kind === "commit"
			? filter.hash
			: filter.kind === "range"
				? filter.toHash
				: null;
	const fromHash = filter.kind === "range" ? filter.fromHash : null;

	return useMemo<DiffRef>(() => {
		switch (filterKind) {
			case "uncommitted":
				return { kind: "uncommitted" };
			case "commit":
				return { kind: "commit", commitHash: commitHash ?? "" };
			case "range":
				return {
					kind: "commit",
					commitHash: commitHash ?? "",
					fromHash: fromHash ?? undefined,
				};
			default:
				return { kind: "against-base", baseBranch };
		}
	}, [filterKind, commitHash, fromHash, baseBranch]);
}
