import { Trans } from "@lingui/react/macro";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { memo, useDeferredValue, useMemo, useState } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { ChangedFileFolderList } from "renderer/routes/_authenticated/_dashboard/components/ChangedFileFolderList";
import { ChangedFileRow } from "renderer/routes/_authenticated/_dashboard/components/ChangedFileRow";
import { ChangesListHeader } from "renderer/routes/_authenticated/_dashboard/components/ChangesListHeader";
import type { ChangedFileEntry } from "renderer/routes/_authenticated/_dashboard/hooks/useChangedFilesTree";
import { useFoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import { filterChangedFiles } from "renderer/routes/_authenticated/_dashboard/utils/filterChangedFiles";
import { PullRequestFileTree } from "./components/PullRequestFileTree";

export interface PullRequestFileListEntry extends ChangedFileEntry {
	oldPath?: string;
}

interface PullRequestFileListProps {
	files: PullRequestFileListEntry[];
	selectedPath: string | null;
	onSelectFile: (path: string) => void;
	startCollapsed: boolean;
}

const getPath = (file: PullRequestFileListEntry) => file.path;

export const PullRequestFileList = memo(function PullRequestFileList({
	files,
	selectedPath,
	onSelectFile,
	startCollapsed,
}: PullRequestFileListProps) {
	const { preferences, setChangesViewMode } = useV2UserPreferences();
	const viewMode = preferences.changesViewMode;
	const { foldSignal, collapsed, toggleFold } = useFoldSignal(startCollapsed);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const visibleFiles = useMemo(
		() => filterChangedFiles(files, deferredQuery),
		[files, deferredQuery],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ChangesListHeader
				query={query}
				onQueryChange={setQuery}
				viewMode={viewMode}
				onViewModeChange={setChangesViewMode}
				collapsed={collapsed}
				onToggleFold={toggleFold}
			/>
			{visibleFiles.length === 0 ? (
				<div className="px-3 py-6 text-center text-sm text-muted-foreground">
					<Trans>No files match your search</Trans>
				</div>
			) : viewMode === "tree" ? (
				<div className="min-h-0 flex-1 pt-1">
					<PullRequestFileTree
						files={visibleFiles}
						foldSignal={foldSignal}
						selectedPath={selectedPath}
						onSelectFile={onSelectFile}
					/>
				</div>
			) : (
				<OverflowFadeContainer
					fadeEdges={["top", "bottom"]}
					className="relative min-h-0 flex-1 overflow-y-auto pt-1"
					data-changes-scroll-container
				>
					<ChangedFileFolderList
						files={visibleFiles}
						getFileKey={getPath}
						foldSignal={foldSignal}
						renderFile={(file) => (
							<ChangedFileRow
								path={file.path}
								oldPath={file.oldPath}
								status={file.status}
								additions={file.additions}
								deletions={file.deletions}
								hideDir
								isSelected={file.path === selectedPath}
								onClick={() => onSelectFile(file.path)}
							/>
						)}
					/>
				</OverflowFadeContainer>
			)}
		</div>
	);
});
