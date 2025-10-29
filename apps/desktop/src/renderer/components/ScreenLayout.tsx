import { useEffect, useState } from "react";
import type { Tab } from "shared/types";
import ResizableGrid from "./ResizableGrid";
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
 * TabInstance - Wrapper for individual tabs in the grid layout
 * Handles position-based resize triggers and delegates rendering to TabContent
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
	// Trigger fit when position changes (for terminal resizing)
	const [fitTrigger, setFitTrigger] = useState(0);

	// Trigger fit when tab position changes (row or col)
	useEffect(() => {
		setFitTrigger((prev) => prev + 1);
	}, [tab.row, tab.col]);

	// Trigger fit when grid is resized
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
	// Trigger fit for all terminals when grid is resized
	const [resizeTrigger, setResizeTrigger] = useState(0);

	const handleGridResize = () => {
		// Increment to trigger terminal re-fit in all TabInstances
		setResizeTrigger((prev) => prev + 1);
	};

	const handleSizesChange = async (rowSizes: number[], colSizes: number[]) => {
		// Save the grid sizes to the workspace config
		if (!worktreeId) return;

		try {
			await window.ipcRenderer.invoke("tab-update-grid-sizes", {
				workspaceId,
				worktreeId,
				tabId: groupTab.id,
				rowSizes,
				colSizes,
			});
		} catch (error) {
			console.error("Failed to save grid sizes:", error);
		}
	};

	// Safety check: ensure groupTab is a group type with tabs
	if (
		!groupTab ||
		groupTab.type !== "group" ||
		!groupTab.tabs ||
		!Array.isArray(groupTab.tabs)
	) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>Invalid group tab structure</p>
					<p className="text-sm text-gray-500 mt-2">
						Please rescan worktrees or create a new tab
					</p>
				</div>
			</div>
		);
	}

	return (
		<ResizableGrid
			rows={groupTab.rows || 2}
			cols={groupTab.cols || 2}
			className="w-full h-full p-1"
			onResize={handleGridResize}
			initialRowSizes={groupTab.rowSizes}
			initialColSizes={groupTab.colSizes}
			onSizesChange={handleSizesChange}
		>
			{groupTab.tabs.map((tab) => {
				const isActive = selectedTabId === tab.id;
				return (
					<div
						key={tab.id}
						className={`overflow-hidden rounded border ${
							isActive
								? "border-blue-500 ring-2 ring-blue-500/50"
								: "border-neutral-800"
						}`}
						style={{
							gridRow: `${(tab.row || 0) + 1} / span ${tab.rowSpan || 1}`,
							gridColumn: `${(tab.col || 0) + 1} / span ${tab.colSpan || 1}`,
						}}
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
					</div>
				);
			})}
		</ResizableGrid>
	);
}
