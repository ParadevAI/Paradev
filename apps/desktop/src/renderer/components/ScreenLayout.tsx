import { useCallback, useEffect, useState } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
	MosaicWindow,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";
import type { Tab } from "shared/types";
import TabContent from "./TabContent";

interface ScreenLayoutProps {
	groupTab: Tab; // A tab with type: "group"
	workingDirectory: string;
	workspaceId: string;
	worktreeId: string | undefined;
	selectedTabId: string | undefined;
	onTabFocus: (tabId: string) => void;
}

interface TabInstanceProps {
	tab: Tab;
	workingDirectory: string;
	workspaceId: string;
	worktreeId: string | undefined;
	groupTabId: string; // ID of the parent group tab
	onTabFocus: (tabId: string) => void;
	resizeTrigger?: number;
}

/**
 * TabInstance - Wrapper for individual tabs in the mosaic layout
 * Handles resize triggers and delegates rendering to TabContent
 */
function TabInstance({
	tab,
	workingDirectory,
	workspaceId,
	worktreeId,
	groupTabId,
	onTabFocus,
	resizeTrigger = 0,
}: TabInstanceProps) {
	// Trigger fit when mosaic is resized (for terminal resizing)
	const [fitTrigger, setFitTrigger] = useState(0);

	// Trigger fit when mosaic pane is resized
	useEffect(() => {
		if (resizeTrigger > 0) {
			setFitTrigger((prev) => prev + 1);
		}
	}, [resizeTrigger]);

	return (
		<TabContent
			tab={tab}
			workingDirectory={workingDirectory}
			workspaceId={workspaceId}
			worktreeId={worktreeId}
			groupTabId={groupTabId}
			onTabFocus={onTabFocus}
			triggerFit={fitTrigger}
		/>
	);
}

export default function ScreenLayout({
	groupTab,
	workingDirectory,
	workspaceId,
	worktreeId,
	selectedTabId,
	onTabFocus,
}: ScreenLayoutProps) {
	// Trigger fit for all terminals when mosaic is resized
	const [resizeTrigger, setResizeTrigger] = useState(0);

	// Initialize mosaic tree from groupTab or create a default tree
	const [mosaicTree, setMosaicTree] = useState<MosaicNode<string> | null>(
		() => {
			if (groupTab.mosaicTree) {
				return groupTab.mosaicTree as MosaicNode<string>;
			}

			// If no mosaic tree exists but tabs exist, create a default layout
			if (groupTab.tabs && groupTab.tabs.length > 0) {
				if (groupTab.tabs.length === 1) {
					return groupTab.tabs[0].id;
				}
				// Create a simple row split for 2+ tabs
				return {
					direction: "row",
					first: groupTab.tabs[0].id,
					second:
						groupTab.tabs.length === 2
							? groupTab.tabs[1].id
							: {
									direction: "column",
									first: groupTab.tabs[1].id,
									second: groupTab.tabs[2]?.id || groupTab.tabs[1].id,
								},
				};
			}

			return null;
		},
	);

	// Helper function to get all tab IDs from a mosaic tree
	const getTabIdsFromTree = (tree: MosaicNode<string> | null): Set<string> => {
		const ids = new Set<string>();
		if (!tree) return ids;

		if (typeof tree === "string") {
			ids.add(tree);
		} else {
			const firstIds = getTabIdsFromTree(tree.first);
			const secondIds = getTabIdsFromTree(tree.second);
			firstIds.forEach((id) => ids.add(id));
			secondIds.forEach((id) => ids.add(id));
		}
		return ids;
	};

	// Save mosaic tree changes to backend
	const handleMosaicChange = useCallback(
		async (newTree: MosaicNode<string> | null) => {
			setMosaicTree(newTree);

			if (!worktreeId) return;

			// Detect which tabs were removed from the mosaic tree
			const oldTabIds = getTabIdsFromTree(mosaicTree);
			const newTabIds = getTabIdsFromTree(newTree);
			const removedTabIds = Array.from(oldTabIds).filter(
				(id) => !newTabIds.has(id),
			);

			try {
				// First, delete any tabs that were removed from the mosaic
				for (const removedTabId of removedTabIds) {
					await window.ipcRenderer.invoke("tab-delete", {
						workspaceId,
						worktreeId,
						tabId: removedTabId,
					});
				}

				// Then update the mosaic tree
				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId,
					worktreeId,
					tabId: groupTab.id,
					mosaicTree: newTree,
				});
			} catch (error) {
				console.error("Failed to save mosaic tree:", error);
			}
		},
		[workspaceId, worktreeId, groupTab.id, mosaicTree],
	);

	// Trigger resize on mosaic change
	const handleRelease = useCallback(() => {
		setResizeTrigger((prev) => prev + 1);
	}, []);

	// Create a map of tab IDs to Tab objects for easy lookup
	const tabsById = new Map(groupTab.tabs?.map((tab) => [tab.id, tab]) || []);

	// Render individual mosaic tile
	const renderTile = useCallback(
		(id: string, path: MosaicBranch[]) => {
			const tab = tabsById.get(id);
			if (!tab) {
				return (
					<div className="w-full h-full flex items-center justify-center text-gray-400">
						Tab not found: {id}
					</div>
				);
			}

			const isActive = selectedTabId === id;

			return (
				<MosaicWindow<string>
					path={path}
					title={tab.name}
					className={isActive ? "active-mosaic-window" : ""}
					toolbarControls={<div />}
				>
					<TabInstance
						tab={tab}
						workingDirectory={workingDirectory}
						workspaceId={workspaceId}
						worktreeId={worktreeId}
						groupTabId={groupTab.id}
						onTabFocus={onTabFocus}
						resizeTrigger={resizeTrigger}
					/>
				</MosaicWindow>
			);
		},
		[
			tabsById,
			selectedTabId,
			workingDirectory,
			workspaceId,
			worktreeId,
			groupTab.id,
			onTabFocus,
			resizeTrigger,
		],
	);

	// Safety check: ensure groupTab is a group type with tabs
	if (
		!groupTab ||
		groupTab.type !== "group" ||
		!groupTab.tabs ||
		!Array.isArray(groupTab.tabs) ||
		groupTab.tabs.length === 0
	) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>No tabs in this group</p>
					<p className="text-sm text-gray-500 mt-2">
						Create a new tab to get started
					</p>
				</div>
			</div>
		);
	}

	if (!mosaicTree) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>Invalid mosaic layout</p>
					<p className="text-sm text-gray-500 mt-2">
						Please rescan worktrees or recreate the group
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-full mosaic-container">
			<Mosaic<string>
				renderTile={renderTile}
				value={mosaicTree}
				onChange={handleMosaicChange}
				onRelease={handleRelease}
				className="mosaic-theme-dark"
			/>
			<style>{`
				.mosaic-container {
					background: #1a1a1a;
				}
				.mosaic-theme-dark .mosaic-window {
					background: #1a1a1a;
					border: 1px solid #333;
				}
				.mosaic-theme-dark .mosaic-window .mosaic-window-toolbar {
					background: #262626;
					border-bottom: 1px solid #333;
					height: 32px;
					padding: 0 8px;
				}
				.mosaic-theme-dark .mosaic-window .mosaic-window-title {
					color: #e5e5e5;
					font-size: 12px;
				}
				.mosaic-theme-dark .mosaic-window-body {
					background: #1a1a1a;
				}
				.mosaic-theme-dark .mosaic-split {
					background: #333;
				}
				.mosaic-theme-dark .mosaic-split:hover {
					background: #444;
				}
				.active-mosaic-window .mosaic-window {
					border: 1px solid #3b82f6 !important;
					box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
				}
			`}</style>
		</div>
	);
}
