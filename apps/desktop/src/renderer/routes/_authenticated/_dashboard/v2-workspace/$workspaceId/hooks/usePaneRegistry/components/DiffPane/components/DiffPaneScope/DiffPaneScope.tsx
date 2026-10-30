import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { ChangesScopeControl } from "../../../../../../components/ChangesScopeControl";
import { DiffStatText } from "../../../../../../components/DiffStatText";
import type { DiffPaneFilter } from "../../../../../../types";
import { useChangesScope } from "../../../../../useChangesScope";

interface DiffPaneScopeProps {
	workspaceId: string;
	additions: number;
	deletions: number;
	filter?: DiffPaneFilter | undefined;
	onClearFilter: () => void;
}

/** The Changes pane header's left side: which diff it shows, and its totals. */
export function DiffPaneScope({
	workspaceId,
	additions,
	deletions,
	filter,
	onClearFilter,
}: DiffPaneScopeProps) {
	const { t } = useLingui();
	const scope = useChangesScope(workspaceId);
	const status = scope.status.data;
	const clearLabel = t({ message: "Show all changes" });
	return (
		<div className="flex min-w-0 items-center gap-1 text-xs">
			{status && !filter?.range && (
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
			<span className="ml-1 shrink-0 whitespace-nowrap text-[11px] tabular-nums">
				<DiffStatText additions={additions} deletions={deletions} />
			</span>
		</div>
	);
}
