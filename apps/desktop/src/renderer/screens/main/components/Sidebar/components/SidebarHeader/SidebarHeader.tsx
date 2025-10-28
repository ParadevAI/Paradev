import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, RefreshCw } from "lucide-react";

interface SidebarHeaderProps {
	onCollapse: () => void;
	onScanWorktrees: () => void;
	isScanningWorktrees: boolean;
	hasWorkspace: boolean;
}

export function SidebarHeader({
	onCollapse,
	onScanWorktrees,
	isScanningWorktrees,
	hasWorkspace,
}: SidebarHeaderProps) {
	return (
		<div
			className="flex items-center"
			style={
				{
					height: "48px",
					paddingLeft: "88px",
					WebkitAppRegion: "drag",
				} as React.CSSProperties
			}
		>
			<div
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				className="flex items-center gap-1"
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" onClick={onCollapse}>
							<PanelLeftClose size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Collapse sidebar</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onScanWorktrees}
							disabled={isScanningWorktrees || !hasWorkspace}
						>
							<RefreshCw
								size={16}
								className={isScanningWorktrees ? "animate-spin" : ""}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Scan worktrees</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
