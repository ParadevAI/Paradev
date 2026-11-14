import { useLingui } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useMemo } from "react";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	type CheckoutGitStatus,
	useCheckoutGitStatus,
} from "../../providers/WorkspaceGitStatusProvider";
import { useAreCheckoutsLoaded } from "../../state/activeRepositoryStore";
import {
	useChangesFilter,
	useSetChangesFilter,
} from "../../state/repositoryChangesFilterStore";
import { checkoutInput } from "../../utils/checkoutInput";
import { useSetBaseBranch } from "../useSetBaseBranch";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export interface ChangesScope {
	status: CheckoutGitStatus;
	filter: ChangesFilter;
	setFilter: (next: ChangesFilter) => void;
	baseBranch: string | null;
	setBaseBranch: (branchName: string | null) => void;
	commits: { data: RouterOutputs["git"]["listCommits"] | undefined };
	branches: { data: RouterOutputs["git"]["listBranches"] | undefined };
	canRenameBranch: boolean;
	renameBranch: (newName: string) => void;
}

/**
 * Which diff the Changes list and pane show (the commit filter and the base
 * branch), shared by the sidebar's Changes tab and the Changes pane header.
 * Each checkout of a multi-repo workspace has its own scope.
 */
export function useChangesScope(
	workspaceId: string,
	repositoryId: string | undefined,
	{ enabled = true }: { enabled?: boolean } = {},
): ChangesScope {
	const { t } = useLingui();
	const status = useCheckoutGitStatus(repositoryId);
	const utils = workspaceTrpc.useUtils();
	const filter = useChangesFilter(workspaceId, repositoryId);
	const setFilter = useSetChangesFilter(workspaceId, repositoryId);
	const scope = useMemo(
		() => checkoutInput(workspaceId, repositoryId),
		[workspaceId, repositoryId],
	);
	const queriesEnabled = useAreCheckoutsLoaded(workspaceId) && enabled;

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(scope, {
		enabled: queriesEnabled,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const setCheckoutBaseBranch = useSetBaseBranch();
	const setBaseBranch = useCallback(
		(branchName: string | null) => {
			setCheckoutBaseBranch({ ...scope, baseBranch: branchName });
		},
		[setCheckoutBaseBranch, scope],
	);

	const commits = workspaceTrpc.git.listCommits.useQuery(
		{ ...scope, baseBranch: baseBranch ?? undefined },
		{ enabled: queriesEnabled, refetchOnWindowFocus: true },
	);

	const branches = workspaceTrpc.git.listBranches.useQuery(scope, {
		enabled: queriesEnabled,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});

	const renameBranchMutation = workspaceTrpc.git.renameBranch.useMutation({
		onSuccess: () => utils.workspace.get.invalidate({ id: workspaceId }),
	});

	const renameBranch = useCallback(
		(newName: string) => {
			const currentName = status.data?.currentBranch.name;
			if (!currentName) return;
			toast.promise(
				renameBranchMutation.mutateAsync({
					...scope,
					oldName: currentName,
					newName,
				}),
				{
					loading: t({
						message: `Renaming branch to ${newName}...`,
					}),
					success: t({
						message: `Branch renamed to ${newName}`,
					}),
					error: (err) =>
						errorMessage(
							err,
							t({
								message: "Failed to rename branch",
							}),
						),
				},
			);
		},
		[scope, status.data?.currentBranch.name, renameBranchMutation, t],
	);

	return {
		status,
		filter,
		setFilter,
		baseBranch,
		setBaseBranch,
		commits,
		branches,
		canRenameBranch: !status.data?.currentBranch.upstream,
		renameBranch,
	};
}
