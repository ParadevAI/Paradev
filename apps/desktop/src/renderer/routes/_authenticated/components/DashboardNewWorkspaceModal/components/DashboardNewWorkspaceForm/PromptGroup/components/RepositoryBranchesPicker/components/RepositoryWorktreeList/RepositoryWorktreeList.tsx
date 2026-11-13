import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { LuCheck, LuFolderGit2 } from "react-icons/lu";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { RepositoryWorktree } from "renderer/stores/new-workspace-draft";

interface RepositoryWorktreeListProps {
	projectId: string;
	repositoryId: string;
	hostId: string | null;
	selectedPath: string | null;
	onSelect: (worktree: RepositoryWorktree) => void;
}

/** The repository's worktrees that no workspace uses; picking one moves it into the workspace. */
export function RepositoryWorktreeList({
	projectId,
	repositoryId,
	hostId,
	selectedPath,
	onSelect,
}: RepositoryWorktreeListProps) {
	const hostUrl = useHostUrl(hostId);
	const { data } = useQuery({
		queryKey: [
			"workspaceCreation",
			"listProjectWorktrees",
			hostUrl,
			projectId,
			repositoryId,
		],
		enabled: !!hostUrl,
		queryFn: () =>
			getHostServiceClientByUrl(
				hostUrl as string,
			).workspaceCreation.listProjectWorktrees.query({
				projectId,
				repositoryId,
			}),
	});
	const worktrees = (data?.worktrees ?? []).filter(
		(worktree) => !worktree.hasWorkspace && !worktree.isMainWorktree,
	);
	if (worktrees.length === 0) return null;

	return (
		<div className="border-b p-1">
			<div className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
				<Trans>Existing worktrees, moved into the workspace</Trans>
			</div>
			{worktrees.map((worktree) => (
				<button
					key={worktree.path}
					type="button"
					onClick={() =>
						onSelect({ path: worktree.path, branch: worktree.branch })
					}
					title={worktree.path}
					className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
				>
					<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="min-w-0 shrink-0 truncate font-mono text-xs">
						{worktree.branch}
					</span>
					<span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
						{worktree.path}
					</span>
					{selectedPath === worktree.path && (
						<LuCheck className="size-3.5 shrink-0" />
					)}
				</button>
			))}
		</div>
	);
}
