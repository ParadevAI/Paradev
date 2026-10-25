import { Trans } from "@lingui/react/macro";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { BaseBranchSelector } from "../WorkspaceSidebar/hooks/useChangesTab/components/BaseBranchSelector";
import { CommitFilterDropdown } from "../WorkspaceSidebar/hooks/useChangesTab/components/CommitFilterDropdown";
import type {
	Branch,
	Commit,
} from "../WorkspaceSidebar/hooks/useChangesTab/types";

interface ChangesScopeControlProps {
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount: number;
	baseBranch: string;
	branches: Branch[];
	onBaseBranchChange: (branchName: string) => void;
	currentBranchName: string;
	canRenameBranch: boolean;
	onRenameBranch: (newName: string) => void;
}

/**
 * Which diff the Changes list shows: the commit filter (with the branch and
 * its rename at the menu's foot), then "vs <base>" while the scope is
 * measured against the base. Shared by the sidebar's Changes tab and the
 * Changes pane header.
 */
export function ChangesScopeControl({
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
	baseBranch,
	branches,
	onBaseBranchChange,
	currentBranchName,
	canRenameBranch,
	onRenameBranch,
}: ChangesScopeControlProps) {
	return (
		<>
			<CommitFilterDropdown
				filter={filter}
				onFilterChange={onFilterChange}
				commits={commits}
				uncommittedCount={uncommittedCount}
				currentBranchName={currentBranchName}
				canRenameBranch={canRenameBranch}
				onRenameBranch={onRenameBranch}
			/>
			{filter.kind === "all" && (
				// Selector as a placeholder in the message: a bare "vs" cannot
				// precede the branch in every language.
				<span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
					<Trans>
						<span className="shrink-0 text-muted-foreground/60">vs</span>{" "}
						<BaseBranchSelector
							branches={branches}
							currentValue={baseBranch}
							onChange={onBaseBranchChange}
						/>
					</Trans>
				</span>
			)}
		</>
	);
}
