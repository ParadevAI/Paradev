import { ChangesScopeControl } from "../../../../../../components/ChangesScopeControl";
import { DiffStatText } from "../../../../../../components/DiffStatText";
import { useChangesScope } from "../../../../../useChangesScope";

interface DiffPaneScopeProps {
	workspaceId: string;
	additions: number;
	deletions: number;
}

/** The Changes pane header's left side: which diff it shows, and its totals. */
export function DiffPaneScope({
	workspaceId,
	additions,
	deletions,
}: DiffPaneScopeProps) {
	const scope = useChangesScope(workspaceId);
	const status = scope.status.data;
	return (
		<div className="flex min-w-0 items-center gap-1 text-xs">
			{status && (
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
			<span className="ml-1 shrink-0 whitespace-nowrap text-[11px] tabular-nums">
				<DiffStatText additions={additions} deletions={deletions} />
			</span>
		</div>
	);
}
