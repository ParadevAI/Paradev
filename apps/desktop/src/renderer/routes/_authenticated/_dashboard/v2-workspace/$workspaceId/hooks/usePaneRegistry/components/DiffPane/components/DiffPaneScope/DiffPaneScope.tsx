import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { DiffStatText } from "renderer/routes/_authenticated/_dashboard/components/DiffStatText";
import { ChangesScopeControl } from "../../../../../../components/ChangesScopeControl";
import { useCheckoutGitStatuses } from "../../../../../../providers/WorkspaceGitStatusProvider";
import type { WorkspaceCheckout } from "../../../../../../state/activeRepositoryStore";
import type { DiffPaneFilter } from "../../../../../../types";
import type { ChangesRepositoryPicker } from "../../../../../useChangesRepositoryPicker";
import { useChangesScope } from "../../../../../useChangesScope";
import { MultiRepoScopeMenu } from "./components/MultiRepoScopeMenu";
import { RepositoryFilter } from "./components/RepositoryFilter";

interface DiffPaneScopeProps {
	workspaceId: string;
	/** The checkout whose scope the header controls. */
	repositoryId: string | undefined;
	additions: number;
	deletions: number;
	filter?: DiffPaneFilter | undefined;
	onClearFilter: () => void;
	/** Set when the workspace has several repositories. */
	repositoryPicker?: {
		repositories: WorkspaceCheckout[];
		picker: ChangesRepositoryPicker;
	};
}

/** The Changes pane header's left side: which diff it shows, and its totals. */
export function DiffPaneScope({
	workspaceId,
	repositoryId,
	additions,
	deletions,
	filter,
	onClearFilter,
	repositoryPicker,
}: DiffPaneScopeProps) {
	const { t } = useLingui();
	const shown = repositoryPicker?.picker.shown;
	const showsSeveral = shown !== undefined && shown.size > 1;
	const scope = useChangesScope(workspaceId, repositoryId, {
		enabled: !showsSeveral,
	});
	const status = scope.status.data;
	const clearLabel = t({ message: "Show all changes" });
	const shownStatuses = useCheckoutGitStatuses(showsSeveral ? [...shown] : []);
	const shownUncommittedCount = shownStatuses.reduce(
		(sum, { data }) =>
			sum + (data ? data.staged.length + data.unstaged.length : 0),
		0,
	);

	return (
		<div className="flex min-w-0 items-center gap-1 text-xs">
			{repositoryPicker && shown && (
				<RepositoryFilter
					repositories={repositoryPicker.repositories}
					shown={shown}
					onChange={repositoryPicker.picker.pick}
				/>
			)}
			{repositoryPicker && showsSeveral && !filter?.range && (
				<MultiRepoScopeMenu
					kind={repositoryPicker.picker.scopeKind}
					onKindChange={repositoryPicker.picker.setScopeKind}
					uncommittedCount={shownUncommittedCount}
				/>
			)}
			{!showsSeveral && status && !filter?.range && (
				<ChangesScopeControl
					filter={scope.filter}
					onFilterChange={scope.setFilter}
					commits={scope.commits.data?.commits ?? []}
					uncommittedCount={status.staged.length + status.unstaged.length}
					baseBranch={scope.baseBranch ?? status.defaultBranch.name}
					branches={scope.branches.data?.branches ?? []}
					// Picking the repo default clears the override (null) instead of
					// pinning it, so the workspace follows a later default change.
					onBaseBranchChange={(branchName) =>
						scope.setBaseBranch(
							branchName === status.defaultBranch.name ? null : branchName,
						)
					}
					currentBranchName={status.currentBranch.name}
					canRenameBranch={scope.canRenameBranch}
					onRenameBranch={scope.renameBranch}
					baseClassName="hidden @min-[420px]/pane-header:flex"
					commitLabelClassName="sr-only @min-[300px]/pane-header:not-sr-only"
				/>
			)}
			{filter && (
				<span className="flex min-w-0 shrink-0 items-center gap-0.5 rounded-md bg-accent py-0.5 pr-0.5 pl-1.5 text-[11px] text-accent-foreground">
					<span className="truncate">
						{filter.range
							? t({ message: "This turn" })
							: t({ message: "This turn's files" })}
					</span>
					<button
						aria-label={clearLabel}
						className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
						onClick={onClearFilter}
						title={clearLabel}
						type="button"
					>
						<X className="size-3" />
					</button>
				</span>
			)}
			<span className="ml-1 hidden shrink-0 whitespace-nowrap text-[11px] tabular-nums @min-[360px]/pane-header:inline">
				<DiffStatText additions={additions} deletions={deletions} />
			</span>
		</div>
	);
}
