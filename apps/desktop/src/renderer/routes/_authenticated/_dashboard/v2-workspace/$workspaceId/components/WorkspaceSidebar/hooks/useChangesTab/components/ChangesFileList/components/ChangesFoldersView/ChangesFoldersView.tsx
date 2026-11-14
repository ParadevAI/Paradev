import { memo } from "react";
import { ChangedFileFolderList } from "renderer/routes/_authenticated/_dashboard/components/ChangedFileFolderList";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { SelectDiffFile } from "../../../../hooks/useChangesContent";
import {
	groupFilesByRepository,
	type RepositoryRoot,
} from "../../utils/repositoryTree";
import { FileRow } from "../FileRow";
import { RepositoryFolderGroup } from "./components/RepositoryFolderGroup";

interface ChangesFoldersViewProps {
	files: ChangesetFile[];
	workspaceId: string;
	repositoryId: string | undefined;
	worktreePath?: string;
	/** Set when the list shows several checkouts: files group by repository first. */
	repositories?: RepositoryRoot[];
	/** Absolute path of the diff pane's open file — highlights its row. */
	selectedFilePath?: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	selectedChangeKey?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: SelectDiffFile;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (absolutePath: string) => void;
}

/**
 * A changes section's files grouped by parent folder, with the workspace
 * row actions (staging, discard, open, drag to terminal).
 */
export const ChangesFoldersView = memo(function ChangesFoldersView({
	files,
	workspaceId,
	repositoryId,
	worktreePath,
	repositories,
	selectedFilePath,
	selectedChangeKey,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFoldersViewProps) {
	const folderList = (
		groupFiles: ChangesetFile[],
		checkout: { repositoryId: string | undefined; worktreePath?: string },
	) => (
		<ChangedFileFolderList
			files={groupFiles}
			getFileKey={getChangesetFileKey}
			foldSignal={foldSignal}
			renderFile={(file) => (
				<FileRow
					file={file}
					workspaceId={workspaceId}
					repositoryId={checkout.repositoryId}
					worktreePath={checkout.worktreePath}
					hideDir
					isSelected={
						!!checkout.worktreePath &&
						toAbsoluteWorkspacePath(checkout.worktreePath, file.path) ===
							selectedFilePath &&
						(selectedChangeKey == null ||
							getChangesetFileKey(file) === selectedChangeKey)
					}
					onSelect={onSelectFile}
					onOpenFile={onOpenFile}
					onOpenInEditor={onOpenInEditor}
				/>
			)}
		/>
	);

	if (!repositories) return folderList(files, { repositoryId, worktreePath });

	return groupFilesByRepository(files, repositories).map((group) => (
		<RepositoryFolderGroup
			key={group.repository.repositoryId}
			name={group.repository.name}
			additions={group.additions}
			deletions={group.deletions}
			foldSignal={foldSignal}
		>
			{folderList(group.files, {
				repositoryId: group.repository.repositoryId,
				worktreePath: group.repository.path,
			})}
		</RepositoryFolderGroup>
	));
});
