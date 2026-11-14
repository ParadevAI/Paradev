import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { checkoutInput } from "../../../../../../utils/checkoutInput";
import type { ChangesRepositoryPicker } from "../../../../../useChangesRepositoryPicker";
import { pickShowingRepository } from "../../utils/pickShowingRepository";

/**
 * Adds the repository of a diff target to the repository pick when the pick
 * hides it, once per navigation. The user can hide it again after that.
 */
export function useShowTargetRepository({
	workspaceId,
	repositoryIds,
	picker,
	targetRepositoryId,
	targetTick,
}: {
	workspaceId: string;
	repositoryIds: string[];
	picker: ChangesRepositoryPicker;
	targetRepositoryId: string | undefined;
	targetTick: number | undefined;
}) {
	const { t } = useLingui();
	const utils = workspaceTrpc.useUtils();
	const { trpcClient } = useWorkspaceClient();
	const latestRef = useRef({ repositoryIds, picker });
	latestRef.current = { repositoryIds, picker };

	// biome-ignore lint/correctness/useExhaustiveDependencies: `targetTick` changes on each navigation
	useEffect(() => {
		const { repositoryIds, picker } = latestRef.current;
		const nextPick = pickShowingRepository(
			repositoryIds,
			picker.shown,
			targetRepositoryId,
		);
		if (!nextPick) return;
		const clearBaseBranchOf = picker.pick(nextPick);
		if (!clearBaseBranchOf) return;
		const input = checkoutInput(workspaceId, clearBaseBranchOf);
		void (async () => {
			const { baseBranch } = await utils.git.getBaseBranch.fetch(input);
			if (baseBranch === null) return;
			await trpcClient.git.setBaseBranch.mutate({ ...input, baseBranch: null });
			void utils.git.getBaseBranch.invalidate(input);
			void utils.git.getStatus.invalidate(input);
			void utils.git.listCommits.invalidate(input);
			void utils.git.getDiff.invalidate(input);
		})().catch((error: unknown) =>
			toast.error(
				(error instanceof Error && error.message) ||
					t({ message: "Failed to change base branch" }),
			),
		);
	}, [workspaceId, targetRepositoryId, targetTick, utils, trpcClient, t]);
}
