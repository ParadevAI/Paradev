import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { FilesTab } from "../../../../../../components/WorkspaceSidebar/components/FilesTab";
import { useWorkspaceGitStatus } from "../../../../../../providers/WorkspaceGitStatusProvider";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { openFileFromTree } from "../../../../../../utils/openFileFromTree";
import { FileOpenInButton } from "../../../FileOpenInButton";
import { FileTreeToggle } from "../../../FileTreeToggle";
import { RepoPicker } from "./components/RepoPicker";

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
	const gitStatus = useWorkspaceGitStatus();
	const selectedFilePath =
		context.pane.kind === "file"
			? (context.pane.data as FilePaneData).filePath
			: undefined;

	const handleSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			if (openInNewTab) {
				store.getState().addTab({
					panes: [
						{
							kind: "file",
							pinned: true,
							data: { filePath, mode: "editor" } as FilePaneData,
						},
					],
				});
				return;
			}
			openFileFromTree({ store, filePath, sourcePaneId: paneId });
		},
		[store, paneId],
	);

	const handlePinFile = useCallback(
		(filePath: string) =>
			openFileFromTree({ store, filePath, sourcePaneId: paneId, pin: true }),
		[store, paneId],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<RepoPicker workspaceId={workspaceId} />
			<div className="min-h-0 flex-1">
				<FilesTab
					variant="fileView"
					trailingActions={
						<>
							{selectedFilePath && (
								<FileOpenInButton
									workspaceId={workspaceId}
									filePath={selectedFilePath}
								/>
							)}
							<FileTreeToggle />
						</>
					}
					onSelectFile={handleSelectFile}
					onPinFile={handlePinFile}
					selectedFilePath={selectedFilePath}
					workspaceId={workspaceId}
					gitStatus={gitStatus.data}
					onSearch={onSearch}
				/>
			</div>
		</div>
	);
}
