import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { StatusIndicator, type WorkspaceStatus } from "./StatusIndicator";

interface MockWorkspace {
	id: string;
	name: string;
	status: WorkspaceStatus;
}

const MOCK_WORKSPACES: MockWorkspace[] = [
	{ id: "1", name: "Homepage Redesign", status: "working" },
	{ id: "2", name: "API Integration", status: "needs-feedback" },
	{ id: "3", name: "Bug Fixes", status: "planning" },
	{ id: "4", name: "Performance Optimization", status: "ready-to-merge" },
];

interface WorkspaceTabsProps {
	onCollapseSidebar: () => void;
	onExpandSidebar: () => void;
	isSidebarOpen: boolean;
}

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({
	onCollapseSidebar,
	onExpandSidebar,
	isSidebarOpen,
}) => {
	const [activeWorkspaceId, setActiveWorkspaceId] = useState(MOCK_WORKSPACES[0].id);

	return (
		<div
			className="flex items-end select-none bg-black/20"
			style={{
				height: "48px",
				paddingLeft: "88px",
				WebkitAppRegion: "drag"
			} as React.CSSProperties}
		>
			<div
				className="flex items-center gap-1 px-2 h-full"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			>
				{/* Sidebar collapse/expand toggle */}
				<div className="flex items-center gap-1 mr-2">
					{isSidebarOpen ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon-sm" onClick={onCollapseSidebar}>
									<PanelLeftClose size={16} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Collapse sidebar</p>
							</TooltipContent>
						</Tooltip>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon-sm" onClick={onExpandSidebar}>
									<PanelLeftOpen size={16} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Expand sidebar</p>
							</TooltipContent>
						</Tooltip>
					)}
				</div>

				{/* Workspace tabs */}
				{MOCK_WORKSPACES.map((workspace) => (
					<button
						key={workspace.id}
						type="button"
						onClick={() => setActiveWorkspaceId(workspace.id)}
						className={`
							flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x
							${
								activeWorkspaceId === workspace.id
									? "bg-neutral-900 text-white border-neutral-700 -mb-px"
									: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
							}
						`}
					>
						<StatusIndicator status={workspace.status} showLabel={false} />
						<span className="text-sm whitespace-nowrap">
							{workspace.name}
						</span>
					</button>
				))}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" className="ml-1">
							<Plus size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Add workspace</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
};
