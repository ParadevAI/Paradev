import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import type React from "react";
import { AppFrame } from "../AppFrame";
import { Background } from "../Background";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { WorktreeTabView } from "./WorktreeTabView";

export const NewLayoutMain: React.FC = () => {
	return (
		<>
			<Background />
			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Workspace tabs at the top */}
					<WorkspaceTabs />

					{/* Main content area with resizable sidebar */}
					<div className="flex-1 overflow-hidden border-t border-neutral-700">
						<ResizablePanelGroup direction="horizontal" autoSaveId="new-layout-panels">
							{/* Sidebar panel with worktree tab view */}
							<ResizablePanel
								defaultSize={25}
								minSize={15}
								maxSize={40}
							>
								<WorktreeTabView />
							</ResizablePanel>

							<ResizableHandle />

							{/* Main content panel */}
							<ResizablePanel defaultSize={75} minSize={30}>
								<div className="h-full bg-[#1e1e1e] flex items-center justify-center m-1 rounded-lg">
									<div className="text-center space-y-2">
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
