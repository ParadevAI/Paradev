import { useLingui } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import {
	useChangesFilter,
	useSetChangesFilter,
} from "../../state/repositoryChangesFilterStore";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export interface ChangesScope {
	status: ReturnType<typeof useWorkspaceGitStatus>;
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
 * A checkout without a local state row keeps its filter in memory.
 */
export function useChangesScope(workspaceId: string): ChangesScope {
	const { t } = useLingui();
	const status = useWorkspaceGitStatus();
	const utils = workspaceTrpc.useUtils();
	const filter = useChangesFilter(workspaceId);
	const setFilter = useSetChangesFilter(workspaceId);

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const setBaseBranchMutation = workspaceTrpc.git.setBaseBranch.useMutation({
		onSuccess: () => {
			void utils.git.getBaseBranch.invalidate({ workspaceId });
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.listCommits.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		// The picker re-renders from getBaseBranch, so a rejected change
		// silently snaps back without this.
		onError: (error) =>
			toast.error(
				error.message ||
					t({
						message: "Failed to change base branch",
					}),
			),
	});

	const setBaseBranch = useCallback(
		(branchName: string | null) => {
			setBaseBranchMutation.mutate({ workspaceId, baseBranch: branchName });
		},
		[setBaseBranchMutation, workspaceId],
	);

	const commits = workspaceTrpc.git.listCommits.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchOnWindowFocus: true },
	);

	const branches = workspaceTrpc.git.listBranches.useQuery(
		{ workspaceId },
		{ refetchInterval: 30_000, refetchOnWindowFocus: true },
	);

	const renameBranchMutation = workspaceTrpc.git.renameBranch.useMutation({
		// A multi-repo rename changes every repository's branch.
		onSuccess: () => utils.workspace.repositories.invalidate(),
	});

	const renameBranch = useCallback(
		(newName: string) => {
			const currentName = status.data?.currentBranch.name;
			if (!currentName) return;
			toast.promise(
				renameBranchMutation.mutateAsync({
					workspaceId,
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
		[workspaceId, status.data?.currentBranch.name, renameBranchMutation, t],
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
