import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	isWithinWorkspacePath,
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { useStore } from "zustand";
import type { FilePaneData, OpenFile, PaneTarget } from "../../types";
import {
	type RecentFile,
	useRecentlyViewedFiles,
} from "../useRecentlyViewedFiles";
import { useRevealInFinder } from "../useRevealInFinder";
import { openFilePaneInStore } from "./utils/openFilePaneInStore";

export function useWorkspaceFileNavigation({
	viewer,
}: {
	viewer: PaneTarget;
}): {
	openFilePane: OpenFile;
	openFilePaneFromTreeClick: OpenFile;
	openPinnedFilePane: (filePath: string) => void;
	revealPath: (
		path: string,
		options?: {
			isDirectory?: boolean;
		},
	) => void;
	recentFiles: RecentFile[];
	openFilePaths: Set<string>;
} {
	const { workspace } = useWorkspace();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspace.id,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? "";

	const { recentFiles, recordView } = useRecentlyViewedFiles(workspace.id);
	const revealInFinder = useRevealInFinder(workspace.id);

	const openFilePathsKey = useStore(viewer.store, (state) =>
		state.tabs
			.flatMap((tab) =>
				Object.values(tab.panes)
					.filter((pane) => pane.kind === "file")
					.map((pane) => (pane.data as FilePaneData).filePath),
			)
			.join("\u0000"),
	);
	const openFilePaths = useMemo(
		() => new Set(openFilePathsKey ? openFilePathsKey.split("\u0000") : []),
		[openFilePathsKey],
	);

	const openFilePane = useCallback<OpenFile>(
		(filePath, openInNewTab, position) => {
			const absoluteFilePath = worktreePath
				? toAbsoluteWorkspacePath(worktreePath, filePath)
				: filePath;
			if (worktreePath) {
				const relativePath = toRelativeWorkspacePath(
					worktreePath,
					absoluteFilePath,
				);
				if (relativePath && relativePath !== ".") {
					recordView({ relativePath, absolutePath: absoluteFilePath });
				}
			}
			viewer.reveal();
			openFilePaneInStore(
				viewer.store,
				absoluteFilePath,
				openInNewTab,
				position,
			);
		},
		[viewer, worktreePath, recordView],
	);

	// User-facing file opens from the workspace sidebar layer the VS-Code-style
	// "click an already-active row to pin it" pattern on top of openFilePane.
	const openFilePaneFromTreeClick = useCallback<OpenFile>(
		(filePath, openInNewTab, position) => {
			if (openInNewTab || position) {
				openFilePane(filePath, openInNewTab, position);
				return;
			}
			const absoluteFilePath = worktreePath
				? toAbsoluteWorkspacePath(worktreePath, filePath)
				: filePath;
			const state = viewer.store.getState();
			const active = state.getActivePane();
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === absoluteFilePath
			) {
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}
			openFilePane(filePath);
		},
		[openFilePane, viewer, worktreePath],
	);

	const openPinnedFilePane = useCallback(
		(filePath: string) => {
			openFilePane(filePath);
			const absoluteFilePath = worktreePath
				? toAbsoluteWorkspacePath(worktreePath, filePath)
				: filePath;
			const state = viewer.store.getState();
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (
						pane.kind === "file" &&
						(pane.data as FilePaneData).filePath === absoluteFilePath
					) {
						state.setPanePinned({ paneId: pane.id, pinned: true });
					}
				}
			}
		},
		[openFilePane, viewer, worktreePath],
	);

	const revealPath = useCallback(
		(path: string, options?: { isDirectory?: boolean }) => {
			const isDirectory = options?.isDirectory === true;
			// The file tree only spans the worktree; paths outside it
			// (e.g. a ~/some/dir link from the terminal) are revealed in Finder.
			if (worktreePath && !isWithinWorkspacePath(worktreePath, path)) {
				revealInFinder(path, { isDirectory });
				return;
			}
			viewer.reveal();
		},
		[viewer, worktreePath, revealInFinder],
	);

	return {
		openFilePane,
		openFilePaneFromTreeClick,
		openPinnedFilePane,
		revealPath,
		recentFiles,
		openFilePaths,
	};
}
