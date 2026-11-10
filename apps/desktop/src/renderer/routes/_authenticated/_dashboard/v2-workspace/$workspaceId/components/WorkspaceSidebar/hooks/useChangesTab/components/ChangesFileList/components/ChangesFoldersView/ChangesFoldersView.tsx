import { memo } from "react";
import { ChangedFileFolderList } from "renderer/routes/_authenticated/_dashboard/components/ChangedFileFolderList";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
import { FileRow } from "../FileRow";

interface ChangesFoldersViewProps {
	files: ChangesetFile[];
	workspaceId: string;
	worktreePath?: string;
	/** Absolute path of the diff pane's open file — highlights its row. */
	selectedFilePath?: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	selectedChangeKey?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

/**
 * A changes section's files grouped by parent folder, with the workspace
 * row actions (staging, discard, open, drag to terminal).
 */
export const ChangesFoldersView = memo(function ChangesFoldersView({
	files,
	workspaceId,
	worktreePath,
	selectedFilePath,
	selectedChangeKey,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFoldersViewProps) {
	const selectedRelPath =
		selectedFilePath && worktreePath
			? toRelativeWorkspacePath(worktreePath, selectedFilePath)
			: selectedFilePath;

	return (
		<ChangedFileFolderList
			files={files}
			getFileKey={getChangesetFileKey}
			foldSignal={foldSignal}
			renderFile={(file) => (
				<FileRow
					file={file}
					workspaceId={workspaceId}
					worktreePath={worktreePath}
					hideDir
					isSelected={
						file.path === selectedRelPath &&
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
});
