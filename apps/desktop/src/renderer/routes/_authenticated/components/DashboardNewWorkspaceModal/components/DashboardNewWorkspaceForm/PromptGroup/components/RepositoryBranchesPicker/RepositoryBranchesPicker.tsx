import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Command, CommandList } from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { LuChevronLeft, LuFolderGit2 } from "react-icons/lu";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import {
	FORM_PICKER_MENU_CLASS,
	FormPickerTrigger,
} from "renderer/routes/_authenticated/components/FormPickerTrigger";
import type {
	RepositoryPullRequest,
	RepositoryWorktree,
} from "renderer/stores/new-workspace-draft";
import { PickerChevron } from "../../../components/PickerChevron";
import { RepositoryBranchList } from "./components/RepositoryBranchList";
import { RepositoryRow } from "./components/RepositoryRow";
import { RepositoryWorktreeList } from "./components/RepositoryWorktreeList";
import { useProjectRepositories } from "./hooks/useProjectRepositories";

interface RepositoryBranchesPickerProps {
	projectId: string;
	hostId: string | null;
	/** Picked base branches by repository id; the rest use their default branch. */
	baseBranches: Record<string, string>;
	/** Repositories that start from a PR; picking a branch for one replaces its PR. */
	pullRequests: Record<string, RepositoryPullRequest>;
	/** Repositories that move in an existing worktree instead of branching. */
	worktrees: Record<string, RepositoryWorktree>;
	onBaseBranchChange: (repositoryId: string, branch: string) => void;
	onWorktreeChange: (
		repositoryId: string,
		worktree: RepositoryWorktree,
	) => void;
}

/**
 * Base branches for a multi-repo project: the repositories, each with its base
 * branch, and a repository's branch list sliding in over them when picked.
 */
export function RepositoryBranchesPicker({
	projectId,
	hostId,
	baseBranches,
	pullRequests,
	worktrees,
	onBaseBranchChange,
	onWorktreeChange,
}: RepositoryBranchesPickerProps) {
	const { t } = useLingui();
	const isParadevShell = useParadevShell();
	const repositories = useProjectRepositories(projectId, hostId);
	const [open, setOpen] = useState(false);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [cameBack, setCameBack] = useState(false);
	const active = repositories.find((repository) => repository.id === activeId);
	const pickedCount = repositories.filter(
		(repository) => baseBranches[repository.id],
	).length;
	const pullRequestCount = repositories.filter(
		(repository) => pullRequests[repository.id],
	).length;
	const worktreeCount = repositories.filter(
		(repository) => worktrees[repository.id],
	).length;

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setActiveId(null);
			setCameBack(false);
		}
	};
	const showRepositories = () => {
		setActiveId(null);
		setCameBack(true);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<FormPickerTrigger
					disabled={repositories.length === 0}
					className="max-w-full"
				>
					<GoGitBranch
						className={isParadevShell ? "size-3.5 shrink-0" : "size-3 shrink-0"}
					/>
					<span className="truncate">
						{pullRequestCount > 0 ? (
							<Plural value={pullRequestCount} one="# PR" other="# PRs" />
						) : worktreeCount > 0 ? (
							<Plural
								value={worktreeCount}
								one="# existing worktree"
								other="# existing worktrees"
							/>
						) : pickedCount === 0 ? (
							<Trans>Default branches</Trans>
						) : (
							<Plural
								value={pickedCount}
								one="# base branch picked"
								other="# base branches picked"
							/>
						)}
					</span>
					<PickerChevron />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				className={`w-[440px] overflow-hidden p-0 ${FORM_PICKER_MENU_CLASS}`}
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				{active ? (
					<div
						key={active.id}
						className="animate-in fade-in-0 slide-in-from-right-8 duration-150"
					>
						<div className="flex items-center gap-1.5 border-b px-1.5 py-1.5">
							<button
								type="button"
								onClick={showRepositories}
								aria-label={t({ message: "Back to repositories" })}
								className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								<LuChevronLeft className="size-4" />
							</button>
							<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate text-sm font-medium">
								{active.name}
							</span>
						</div>
						{pullRequests[active.id] && (
							<div className="border-b px-3 py-2 text-[11px] text-muted-foreground">
								<Trans>
									Pick a branch to start from instead of PR #
									{pullRequests[active.id]?.prNumber}.
								</Trans>
							</div>
						)}
						<RepositoryWorktreeList
							repositoryId={active.id}
							hostId={hostId}
							selectedPath={worktrees[active.id]?.path ?? null}
							onSelect={(worktree) => {
								onWorktreeChange(active.id, worktree);
								showRepositories();
							}}
						/>
						<RepositoryBranchList
							repositoryId={active.id}
							hostId={hostId}
							selectedBranch={
								worktrees[active.id] ? null : (baseBranches[active.id] ?? null)
							}
							onSelect={(branch) => {
								onBaseBranchChange(active.id, branch);
								showRepositories();
							}}
						/>
					</div>
				) : (
					<Command
						className={
							cameBack
								? "animate-in fade-in-0 slide-in-from-left-8 duration-150"
								: undefined
						}
					>
						<div className="border-b px-3 py-2 text-[11px] text-muted-foreground">
							<Trans>Each repository branches from its base branch.</Trans>
						</div>
						<CommandList className="max-h-[420px] p-1">
							{repositories.map((repository) => (
								<RepositoryRow
									key={repository.id}
									repository={repository}
									hostId={hostId}
									selectedBranch={baseBranches[repository.id]}
									pullRequest={pullRequests[repository.id]}
									worktree={worktrees[repository.id]}
									onOpen={() => setActiveId(repository.id)}
								/>
							))}
						</CommandList>
					</Command>
				)}
			</PopoverContent>
		</Popover>
	);
}
