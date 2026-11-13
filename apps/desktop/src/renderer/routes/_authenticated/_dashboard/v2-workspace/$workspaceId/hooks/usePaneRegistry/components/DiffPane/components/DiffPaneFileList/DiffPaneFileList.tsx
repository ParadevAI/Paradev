import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useChangesTab } from "../../../../../../components/WorkspaceSidebar/hooks/useChangesTab";
import { useWorkspaceCheckouts } from "../../../../../../state/activeRepositoryStore";
import type { DiffPaneData, PaneViewerData } from "../../../../../../types";
import { rootFilePath } from "../../../../../../utils/rootFilePath";
import { useHeldWhileTabHidden } from "../../hooks/useHeldWhileTabHidden";
import {
	FILE_LIST_MIN_WIDTH,
	MIN_DIFF_WIDTH,
} from "../../utils/fileListLayout";

const DEFAULT_WIDTH = 260;
const MAX_WIDTH = 480;
const OVERLAY_WIDTH = 300;
// Keeps a strip of the diff visible beside the list.
const OVERLAY_GUTTER = 48;

interface DiffPaneFileListProps {
	context: RendererContext<PaneViewerData>;
	layout: "docked" | "overlay";
	containerWidth: number;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
}

export function DiffPaneFileList({
	context,
	layout,
	containerWidth,
	workspaceId,
	onOpenFile,
}: DiffPaneFileListProps) {
	const { t } = useLingui();
	const { store, actions } = context;
	const data = context.pane.data as DiffPaneData;
	const { preferences, setChangesFileListWidth } = useV2UserPreferences();
	const width = preferences.changesFileListWidth ?? DEFAULT_WIDTH;
	const maxWidth = Math.min(MAX_WIDTH, containerWidth - MIN_DIFF_WIDTH);
	const checkouts = useWorkspaceCheckouts(workspaceId);

	const handleSelectFile = useCallback(
		(
			path: string,
			openInNewTab?: boolean,
			changeKey?: string,
			repositoryId?: string,
		) => {
			if (openInNewTab) {
				store.getState().addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path,
								changeKey,
								repositoryId,
								collapsedFiles: [],
								focusTick: Date.now(),
							} as DiffPaneData,
						},
					],
				});
			} else {
				actions.updateData({
					...data,
					path,
					changeKey,
					repositoryId,
					collapsedFiles: changeKey
						? (data.collapsedFiles ?? []).filter((key) => key !== changeKey)
						: (data.collapsedFiles ?? []),
					focusLine: undefined,
					focusSide: undefined,
					focusTick: Date.now(),
					filter:
						data.filter &&
						(data.filter.paths?.includes(
							rootFilePath(checkouts, repositoryId, path),
						) ??
							true)
							? data.filter
							: undefined,
				} as DiffPaneData);
			}
		},
		[store, actions, data, checkouts],
	);

	const changesTab = useChangesTab({
		workspaceId,
		selectedDiffTarget: data.path
			? {
					path: data.path,
					changeKey: data.changeKey,
					repositoryId: data.repositoryId,
				}
			: undefined,
		onSelectFile: handleSelectFile,
		onOpenFile,
		compact: true,
	});

	// Every git change re-renders each file row; a hidden tab catches up when shown.
	const content = useHeldWhileTabHidden(changesTab.content);

	const list = (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			{content}
		</div>
	);

	if (layout === "overlay") {
		return (
			<aside
				aria-label={t({ message: "Files" })}
				className="absolute inset-y-0 right-0 z-30 border-l border-border bg-background shadow-lg"
				style={{
					width: Math.min(OVERLAY_WIDTH, containerWidth - OVERLAY_GUTTER),
				}}
			>
				{list}
			</aside>
		);
	}

	return (
		<ResizablePanel
			width={Math.min(width, maxWidth)}
			onWidthChange={setChangesFileListWidth}
			commitOnRelease
			minWidth={FILE_LIST_MIN_WIDTH}
			maxWidth={maxWidth}
			handleSide="left"
			onDoubleClickHandle={() => setChangesFileListWidth(DEFAULT_WIDTH)}
		>
			{list}
		</ResizablePanel>
	);
}
