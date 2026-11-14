import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import {
	memo,
	type ReactNode,
	useCallback,
	useDeferredValue,
	useMemo,
	useState,
} from "react";
import { ChangesListHeader } from "renderer/routes/_authenticated/_dashboard/components/ChangesListHeader";
import { ChangesSearchInput } from "renderer/routes/_authenticated/_dashboard/components/ChangesSearchInput";
import { useFoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import { filterChangedFiles } from "renderer/routes/_authenticated/_dashboard/utils/filterChangedFiles";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { FailedRepositoryRows } from "../../../../../FailedRepositoryRows";
import type { SelectDiffFile } from "../../hooks/useChangesContent";
import { ChangesFileList } from "../ChangesFileList";
import type { RepositoryRoot } from "../ChangesFileList/utils/repositoryTree";
import { ChangesToolbar } from "../ChangesToolbar";
import { shouldShowChangesLoading } from "./shouldShowChangesLoading";

interface ChangesTabContentProps {
	workspaceId: string;
	repositoryId: string | undefined;
	/** One checkout's git status; while it loads or fails the list waits. */
	status?: {
		data: unknown;
		isLoading: boolean;
	};
	/** Left side of the toolbar; the compact list has no toolbar. */
	scope: ReactNode;
	viewMode: ChangesViewMode;
	files: ChangesetFile[];
	isLoading: boolean;
	worktreePath?: string;
	repositories?: RepositoryRoot[];
	/** Shown repositories whose changes failed to load. */
	failedRepositories?: RepositoryRoot[];
	selectedFilePath?: string;
	selectedChangeKey?: string;
	onSelectFile?: SelectDiffFile;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (absolutePath: string) => void;
	onViewModeChange: (viewMode: ChangesViewMode) => void;
	compact?: boolean;
}

const NO_REPOSITORIES: RepositoryRoot[] = [];

export const ChangesTabContent = memo(function ChangesTabContent({
	workspaceId,
	repositoryId,
	status,
	scope,
	viewMode,
	files,
	isLoading,
	worktreePath,
	repositories,
	failedRepositories = NO_REPOSITORIES,
	selectedFilePath,
	selectedChangeKey,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
	onViewModeChange,
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

	if (status && shouldShowChangesLoading(status)) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner className="size-3.5" />
				<span>
					<Trans>Loading changes...</Trans>
				</span>
			</div>
		);
	}

	if (status && !status.data) {
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
							scope={scope}
							viewMode={viewMode}
							onViewModeChange={onViewModeChange}
							collapsed={foldCollapsed}
							onToggleFold={toggleFold}
							searchOpen={searchOpen}
							onToggleSearch={toggleSearch}
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
			<FailedRepositoryRows repositories={failedRepositories} />
			<ChangesFileList
				files={visibleFiles}
				isFiltered={isFiltered}
				workspaceId={workspaceId}
				repositoryId={repositoryId}
				isLoading={isLoading}
				viewMode={viewMode}
				worktreePath={worktreePath}
				repositories={repositories}
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
