import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { FilesTab } from "../../../../../../components/WorkspaceSidebar/components/FilesTab";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { openFileFromTree } from "../../../../../../utils/openFileFromTree";
import { useRootGitStatus } from "../../../../../useRootGitStatus";

interface FileViewTreeProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onSearch?: () => void;
}

export function FileViewTree({
	context,
	workspaceId,
	onSearch,
}: FileViewTreeProps) {
	const { store } = context;
	const paneId = context.pane.id;
	const gitStatus = useRootGitStatus(workspaceId);
	const selectedFilePath =
		context.pane.kind === "file"
			? (context.pane.data as FilePaneData).filePath
			: undefined;

	const handleSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) =>
			openFileFromTree({
				store,
				filePath,
				sourcePaneId: paneId,
				pin: openInNewTab,
			}),
		[store, paneId],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1">
				<FilesTab
					variant="fileView"
					onSelectFile={handleSelectFile}
					selectedFilePath={selectedFilePath}
					workspaceId={workspaceId}
					gitStatus={gitStatus}
					onSearch={onSearch}
				/>
			</div>
		</div>
	);
}
