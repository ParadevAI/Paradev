import { useEffect, useState } from "react";
import type { Tab, TabGroup } from "shared/types";
import TabContent from "./TabContent";
import ResizableGrid from "./ResizableGrid";

interface ScreenLayoutProps {
    tabGroup: TabGroup;
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
    tabGroupId: string;
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
    tabGroupId,
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
            tabGroupId={tabGroupId}
            onTabFocus={onTabFocus}
            triggerFit={fitTrigger}
        />
    );
}

export default function ScreenLayout({
    tabGroup,
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

    // Safety check: ensure tabGroup has tabs
    if (!tabGroup || !tabGroup.tabs || !Array.isArray(tabGroup.tabs)) {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                    <p>Invalid tab group structure</p>
                    <p className="text-sm text-gray-500 mt-2">
                        Please rescan worktrees or create a new tab group
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ResizableGrid
            rows={tabGroup.rows}
            cols={tabGroup.cols}
            className="w-full h-full p-1"
            onResize={handleGridResize}
        >
            {tabGroup.tabs.map((tab) => {
                const isActive = selectedTabId === tab.id;
                return (
                    <div
                        key={tab.id}
                        className={`overflow-hidden rounded border ${isActive
                                ? "border-blue-500 ring-2 ring-blue-500/50"
                                : "border-neutral-800"
                            }`}
                        style={{
                            gridRow: `${tab.row + 1} / span ${tab.rowSpan || 1}`,
                            gridColumn: `${tab.col + 1} / span ${tab.colSpan || 1}`,
                        }}
                    >
                        <TabInstance
                            tab={tab}
                            workingDirectory={workingDirectory}
                            workspaceId={workspaceId}
                            worktreeId={worktreeId}
                            tabGroupId={tabGroup.id}
                            onTabFocus={onTabFocus}
                            resizeTrigger={resizeTrigger}
                        />
                    </div>
                );
            })}
        </ResizableGrid>
    );
}
