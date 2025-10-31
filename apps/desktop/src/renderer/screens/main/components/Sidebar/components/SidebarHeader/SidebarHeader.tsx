import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { RefreshCw, Settings } from "lucide-react";

interface SidebarHeaderProps {
	onScanWorktrees: () => void;
	isScanningWorktrees: boolean;
	hasWorkspace: boolean;
}

export function SidebarHeader({
	onScanWorktrees,
	isScanningWorktrees,
	hasWorkspace,
}: SidebarHeaderProps) {
	const handleOpenSettings = async () => {
		const result = await window.ipcRenderer.invoke("open-app-settings");
		if (!result.success) {
			alert(`Failed to open settings: ${result.error}`);
		}
	};

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
				className="flex items-center gap-1 ml-auto"
			>
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
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" onClick={handleOpenSettings}>
							<Settings size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Open app settings</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
