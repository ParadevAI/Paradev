import { Trans } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { Spinner } from "@superset/ui/spinner";
import type { inferRouterOutputs } from "@trpc/server";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { ChangesListHeader } from "renderer/routes/_authenticated/_dashboard/components/ChangesListHeader";
import { ChangesSearchInput } from "renderer/routes/_authenticated/_dashboard/components/ChangesSearchInput";
import { useFoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import { filterChangedFiles } from "renderer/routes/_authenticated/_dashboard/utils/filterChangedFiles";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { ChangesFileList } from "../ChangesFileList";
import { ChangesToolbar } from "../ChangesToolbar";
import { shouldShowChangesLoading } from "./shouldShowChangesLoading";

type RouterOutputs = inferRouterOutputs<AppRouter>;

interface ChangesTabContentProps {
	workspaceId: string;
	status: {
		data: RouterOutputs["git"]["getStatus"] | undefined;
		isFetching: boolean;
		isLoading: boolean;
	};
	commits: { data: RouterOutputs["git"]["listCommits"] | undefined };
	branches: { data: RouterOutputs["git"]["listBranches"] | undefined };
	filter: ChangesFilter;
	viewMode: ChangesViewMode;
	baseBranch: string | null;
	files: ChangesetFile[];
	isLoading: boolean;
	worktreePath?: string;
	selectedFilePath?: string;
	selectedChangeKey?: string;
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
	onFilterChange: (filter: ChangesFilter) => void;
	onViewModeChange: (viewMode: ChangesViewMode) => void;
	onBaseBranchChange: (branchName: string | null) => void;
	onRenameBranch: (newName: string) => void;
	canRenameBranch: boolean;
	compact?: boolean;
}

export const ChangesTabContent = memo(function ChangesTabContent({
	workspaceId,
	status,
	commits,
	branches,
	filter,
	viewMode,
	baseBranch,
	files,
	isLoading,
	worktreePath,
	selectedFilePath,
	selectedChangeKey,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
	onFilterChange,
	onViewModeChange,
	onBaseBranchChange,
	onRenameBranch,
	canRenameBranch,
	compact = false,
}: ChangesTabContentProps) {
	const { foldSignal, collapsed: foldCollapsed, toggleFold } = useFoldSignal();

	// Search is view-local and deliberately not persisted: reopening the tab
	// starts from the full list. Filtering runs on the deferred query so the
	// tree view's path resets don't run on every keystroke.
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const deferredQuery = useDeferredValue(searchQuery);
	const toggleSearch = useCallback(() => {
		setSearchOpen((open) => !open);
		setSearchQuery("");
	}, []);
	const closeSearch = useCallback(() => {
		setSearchOpen(false);
		setSearchQuery("");
	}, []);

	const visibleFiles = useMemo(
		() => filterChangedFiles(files, deferredQuery),
		[files, deferredQuery],
	);
	// From the query, not a length comparison: with zero changed files both
	// lists are empty, and an active search must still read as a search miss.
	const isFiltered = deferredQuery.trim().length > 0;

	if (shouldShowChangesLoading(status)) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner className="size-3.5" />
				<span>
					<Trans>Loading changes...</Trans>
				</span>
			</div>
		);
	}

	if (!status.data) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				<Trans>Unable to load git status</Trans>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			{compact ? (
				<ChangesListHeader
					query={searchQuery}
					onQueryChange={setSearchQuery}
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
					collapsed={foldCollapsed}
					onToggleFold={toggleFold}
				/>
			) : (
				<>
					<div className="pt-1">
						<ChangesToolbar
							filter={filter}
							onFilterChange={onFilterChange}
							commits={commits.data?.commits ?? []}
							uncommittedCount={
								status.data.staged.length + status.data.unstaged.length
							}
							viewMode={viewMode}
							onViewModeChange={onViewModeChange}
							collapsed={foldCollapsed}
							onToggleFold={toggleFold}
							searchOpen={searchOpen}
							onToggleSearch={toggleSearch}
							baseBranch={baseBranch ?? status.data.defaultBranch.name}
							branches={branches.data?.branches ?? []}
							// Picking the repo default clears the override (null) instead of
							// pinning it, so the workspace follows a later default change.
							onBaseBranchChange={(branchName) =>
								onBaseBranchChange(
									branchName === status.data?.defaultBranch.name
										? null
										: branchName,
								)
							}
							currentBranchName={status.data.currentBranch.name}
							canRenameBranch={canRenameBranch}
							onRenameBranch={onRenameBranch}
						/>
					</div>
					{searchOpen && (
						<ChangesSearchInput
							query={searchQuery}
							onQueryChange={setSearchQuery}
							onClose={closeSearch}
						/>
					)}
				</>
			)}
			<ChangesFileList
				files={visibleFiles}
				isFiltered={isFiltered}
				workspaceId={workspaceId}
				isLoading={isLoading}
				viewMode={viewMode}
				worktreePath={worktreePath}
				selectedFilePath={selectedFilePath}
				selectedChangeKey={selectedChangeKey}
				foldSignal={foldSignal}
				onSelectFile={onSelectFile}
				onOpenFile={onOpenFile}
				onOpenInEditor={onOpenInEditor}
			/>
		</div>
	);
});
