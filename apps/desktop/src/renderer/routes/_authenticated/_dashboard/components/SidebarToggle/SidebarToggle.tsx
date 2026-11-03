import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuPanelLeft, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";
import { useWorkspaceSidebarStore } from "renderer/stores";

export function SidebarToggle() {
	const { isCollapsed, toggleCollapsed } = useWorkspaceSidebarStore();
	const collapsed = isCollapsed();

	const getToggleIcon = (isHovering: boolean) => {
		if (collapsed) {
			return isHovering ? (
				<LuPanelLeftOpen
					className="size-4"
					strokeWidth={HEADER_ICON_STROKE_WIDTH}
				/>
			) : (
				<LuPanelLeft
					className="size-4"
					strokeWidth={HEADER_ICON_STROKE_WIDTH}
				/>
			);
		}
		return isHovering ? (
			<LuPanelLeftClose
				className="size-4"
				strokeWidth={HEADER_ICON_STROKE_WIDTH}
			/>
		) : (
			<LuPanelLeft className="size-4" strokeWidth={HEADER_ICON_STROKE_WIDTH} />
		);
	};

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggleCollapsed}
					className={cn("no-drag group", HEADER_ICON_BUTTON_CLASS)}
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<HotkeyLabel
					fallbackLabel="Toggle sidebar"
					id="TOGGLE_WORKSPACE_SIDEBAR"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
