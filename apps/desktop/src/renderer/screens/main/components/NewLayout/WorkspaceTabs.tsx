import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Plus } from "lucide-react";
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

export const WorkspaceTabs: React.FC = () => {
	const [activeWorkspaceId, setActiveWorkspaceId] = useState(MOCK_WORKSPACES[0].id);

	return (
		<div
			className="flex items-center border-b border-neutral-700 select-none"
			style={{ height: "48px", WebkitAppRegion: "drag" } as React.CSSProperties}
		>
			<div
				className="flex items-center gap-1 px-2 overflow-x-auto"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			>
				{MOCK_WORKSPACES.map((workspace) => (
					<button
						key={workspace.id}
						type="button"
						onClick={() => setActiveWorkspaceId(workspace.id)}
						className={`
							flex items-center gap-2 px-3 py-1.5 rounded-md transition-all h-8
							${
								activeWorkspaceId === workspace.id
									? "bg-neutral-800 text-white border border-neutral-700"
									: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
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
