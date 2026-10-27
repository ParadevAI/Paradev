import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useStore } from "zustand";
import { FilesTab } from "../../../../components/WorkspaceSidebar/components/FilesTab";
import { useWorkspaceGitStatus } from "../../../../providers/WorkspaceGitStatusProvider";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { openFileInFilesTab } from "./utils/openFileInFilesTab";

interface FilesTreePaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onSearch?: () => void;
}

export function FilesTreePane({
	context,
	workspaceId,
	onSearch,
}: FilesTreePaneProps) {
	const { store } = context;
	const paneId = context.pane.id;
	const tabId = context.tab.id;
	const gitStatus = useWorkspaceGitStatus();

	const selectedFilePath = useStore(store, (state) => {
		const tab = state.getTab(tabId);
		if (!tab) return undefined;
		const active = tab.activePaneId ? tab.panes[tab.activePaneId] : undefined;
		const filePane =
			active?.kind === "file"
				? active
				: Object.values(tab.panes).find((pane) => pane.kind === "file");
		return (filePane?.data as FilePaneData | undefined)?.filePath;
	});

	const handleSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			if (openInNewTab) {
				store.getState().addTab({
					panes: [
						{
							kind: "file",
							data: { filePath, mode: "editor" } as FilePaneData,
						},
					],
				});
				return;
			}
			openFileInFilesTab({ store, tabId, treePaneId: paneId, filePath });
		},
		[store, tabId, paneId],
	);

	const handlePinFile = useCallback(
		(filePath: string) =>
			openFileInFilesTab({
				store,
				tabId,
				treePaneId: paneId,
				filePath,
				pin: true,
			}),
		[store, tabId, paneId],
	);

	return (
		<FilesTab
			onSelectFile={handleSelectFile}
			onPinFile={handlePinFile}
			selectedFilePath={selectedFilePath}
			workspaceId={workspaceId}
			gitStatus={gitStatus.data}
			onSearch={onSearch}
		/>
	);
}
