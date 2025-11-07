import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, Settings } from "lucide-react";

export function SidebarHeader() {
	const handleCollapse = () => {
		// TODO: Implement collapse functionality
		console.log("Collapse sidebar");
	};

	const handleOpenSettings = () => {
		// TODO: Implement settings
		console.log("Open settings");
	};

	return (
		<div
			className="flex items-center border-b border-neutral-700"
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
						<Button variant="ghost" size="icon-sm" onClick={handleCollapse}>
							<PanelLeftClose size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Collapse sidebar</p>
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
