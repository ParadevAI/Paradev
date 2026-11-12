import { Trans } from "@lingui/react/macro";
import { CommandItem } from "@superset/ui/command";
import { LuChevronRight, LuFolderGit2, LuGitPullRequest } from "react-icons/lu";
import type {
	RepositoryPullRequest,
	RepositoryWorktree,
} from "renderer/stores/new-workspace-draft";
import { useBranchContext } from "../../../../../hooks/useBranchContext";

interface RepositoryRowProps {
	repository: { id: string; name: string };
	hostId: string | null;
	selectedBranch: string | undefined;
	pullRequest: RepositoryPullRequest | undefined;
	worktree: RepositoryWorktree | undefined;
	onOpen: () => void;
}

export function RepositoryRow({
	repository,
	hostId,
	selectedBranch,
	pullRequest,
	worktree,
	onOpen,
}: RepositoryRowProps) {
	// Same query as the repository's branch list, so opening it is instant.
	const { defaultBranch, isLoading } = useBranchContext(
		repository.id,
		hostId,
		"",
		"all",
	);
	const branch = selectedBranch ?? defaultBranch;

	return (
		<CommandItem
			value={repository.id}
			onSelect={onOpen}
			className="gap-2.5 rounded-md px-2.5 py-2"
		>
			<LuFolderGit2 className="size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate text-sm">{repository.name}</span>
			{worktree ? (
				<span
					title={worktree.path}
					className="flex max-w-[60%] items-center gap-1.5 text-xs text-muted-foreground"
				>
					<span className="truncate font-mono">{worktree.branch}</span>
					<span className="shrink-0 rounded-sm bg-sky-500/15 px-1 text-[10px] text-sky-600 dark:text-sky-400">
						<Trans>existing worktree</Trans>
					</span>
				</span>
			) : pullRequest ? (
				<span className="flex max-w-[60%] items-center gap-1.5 text-xs text-muted-foreground">
					<LuGitPullRequest className="size-3 shrink-0" />
					<span className="shrink-0 tabular-nums">#{pullRequest.prNumber}</span>
					<span className="truncate font-mono">{pullRequest.headRefName}</span>
					{pullRequest.matched && (
						<span className="shrink-0 rounded-sm bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">
							<Trans>matched</Trans>
						</span>
					)}
				</span>
			) : isLoading && !branch ? (
				<span className="h-2.5 w-14 animate-pulse rounded-sm bg-muted-foreground/15" />
			) : (
				<span className="max-w-[50%] truncate font-mono text-xs text-muted-foreground">
					{branch}
				</span>
			)}
			<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
		</CommandItem>
	);
}
