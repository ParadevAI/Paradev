import { Plural, Trans } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { GitCompareArrows } from "lucide-react";
import { LuFolderGit2 } from "react-icons/lu";
import {
	VscChevronDown,
	VscGitPullRequest,
	VscGitPullRequestCreate,
} from "react-icons/vsc";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import { useRepositoryShipSnapshots } from "../../../../hooks/useRepositoryShipSnapshots";
import { ChangesStats } from "../../../ChangesStats";
import { RepositoryShipList } from "../../../RepositoryShipList";

interface MultiRepoShipControlProps {
	workspaceId: string;
	repositories: Array<{ repositoryId: string; name: string }>;
	isChangesOpen: boolean;
	toggleLabel: string;
	onToggleChanges: () => void;
	onOpenPullRequest: OpenPullRequestPane;
}

/**
 * The tab-bar Changes control for a multi-repo workspace: the stats of every
 * checkout, and a ship menu with one row per repository.
 */
export function MultiRepoShipControl({
	workspaceId,
	repositories,
	isChangesOpen,
	toggleLabel,
	onToggleChanges,
	onOpenPullRequest,
}: MultiRepoShipControlProps) {
	const { byId, totals, pendingCount, pullRequestCount, sources } =
		useRepositoryShipSnapshots(
			workspaceId,
			repositories.map(({ repositoryId }) => repositoryId),
		);

	return (
		<>
			{sources}
			<div className="flex h-7 items-stretch divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 bg-muted/30">
				{totals.fileCount > 0 && (
					<button
						type="button"
						aria-pressed={isChangesOpen}
						aria-label={toggleLabel}
						onClick={onToggleChanges}
						className={cn(
							"flex items-center gap-1.5 px-2 text-xs outline-none transition-colors hover:bg-accent/60",
							isChangesOpen && "bg-accent/60",
						)}
					>
						<GitCompareArrows className="size-3.5" />
						<ChangesStats stats={totals} />
					</button>
				)}
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1.5 px-2 text-xs font-medium outline-none transition-colors hover:bg-accent/60 data-[state=open]:bg-accent/60"
						>
							{pendingCount > 0 ? (
								<>
									<VscGitPullRequestCreate className="size-3.5" />
									<Trans>Ship</Trans>
									<span className="tabular-nums text-muted-foreground">
										{pendingCount}
									</span>
								</>
							) : pullRequestCount > 0 ? (
								<>
									<VscGitPullRequest className="size-3.5" />
									<Plural value={pullRequestCount} one="# PR" other="# PRs" />
								</>
							) : (
								<LuFolderGit2 className="size-3.5 text-muted-foreground" />
							)}
							<VscChevronDown className="size-3 text-muted-foreground" />
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={8}
						className="w-[400px] overflow-hidden p-0"
					>
						<RepositoryShipList
							workspaceId={workspaceId}
							repositories={repositories}
							snapshots={byId}
							onOpenPullRequest={onOpenPullRequest}
						/>
					</PopoverContent>
				</Popover>
			</div>
		</>
	);
}
