import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import type React from "react";
import { useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { AppFrame } from "../AppFrame";
import { Background } from "../Background";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { WorktreeTabView } from "./WorktreeTabView";

export const NewLayoutMain: React.FC = () => {
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);

	const handleCollapseSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && !panel.isCollapsed()) {
			panel.collapse();
			setIsSidebarOpen(false);
		}
	};

	const handleExpandSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && panel.isCollapsed()) {
			panel.expand();
			setIsSidebarOpen(true);
		}
	};

	return (
		<>
			<Background />

			{/* Hover trigger area when sidebar is hidden */}
			{!isSidebarOpen && (
				<div
					className="fixed left-0 top-0 bottom-0 w-2 z-50"
					onMouseEnter={() => setShowSidebarOverlay(true)}
				/>
			)}

			{/* Sidebar overlay when hidden and hovering */}
			{!isSidebarOpen && showSidebarOverlay && (
				<div
					className="fixed left-0 top-0 bottom-0 w-80 z-40 animate-in slide-in-from-left duration-200"
					onMouseLeave={() => setShowSidebarOverlay(false)}
				>
					<div className="h-full border-r border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
						<WorktreeTabView />
					</div>
				</div>
			)}

			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Workspace tabs at the top */}
					<WorkspaceTabs
						onCollapseSidebar={handleCollapseSidebar}
						onExpandSidebar={handleExpandSidebar}
						isSidebarOpen={isSidebarOpen}
					/>

					{/* Main content area with resizable sidebar */}
					<div className="flex-1 overflow-hidden border-t border-neutral-700">
						<ResizablePanelGroup direction="horizontal" autoSaveId="new-layout-panels">
							{/* Sidebar panel with worktree tab view */}
							<ResizablePanel
								ref={sidebarPanelRef}
								defaultSize={25}
								minSize={15}
								maxSize={40}
								collapsible
								onCollapse={() => setIsSidebarOpen(false)}
								onExpand={() => setIsSidebarOpen(true)}
							>
								<WorktreeTabView />
							</ResizablePanel>

							<ResizableHandle />

							{/* Main content panel */}
							<ResizablePanel defaultSize={75} minSize={30}>
								<div className="h-full bg-[#1e1e1e] flex items-center justify-center p-12 m-1 rounded-lg">
									<div>
										<h2 className="text-2xl font-semibold text-neutral-400">
											New UI Mock
										</h2>
										<p className="text-neutral-500 text-sm">
											Main content area (terminal/preview will go here)
										</p>
									</div>
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</div>
			</AppFrame>
		</>
	);
};
