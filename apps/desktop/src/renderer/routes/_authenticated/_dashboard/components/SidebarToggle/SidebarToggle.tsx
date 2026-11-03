import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuPanelLeft, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { HotkeyLabel } from "renderer/hotkeys";
import { useWorkspaceSidebarStore } from "renderer/stores";

export function SidebarToggle() {
	const { isCollapsed, toggleCollapsed } = useWorkspaceSidebarStore();
	const collapsed = isCollapsed();
	const isParadevShell = useParadevShell();
	const strokeWidth = isParadevShell ? HEADER_ICON_STROKE_WIDTH : 1.5;

	const getToggleIcon = (isHovering: boolean) => {
		if (collapsed) {
			return isHovering ? (
				<LuPanelLeftOpen className="size-4" strokeWidth={strokeWidth} />
			) : (
				<LuPanelLeft className="size-4" strokeWidth={strokeWidth} />
			);
		}
		return isHovering ? (
			<LuPanelLeftClose className="size-4" strokeWidth={strokeWidth} />
		) : (
			<LuPanelLeft className="size-4" strokeWidth={strokeWidth} />
		);
	};

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggleCollapsed}
					className={
						isParadevShell
							? cn("no-drag group", HEADER_ICON_BUTTON_CLASS)
							: "no-drag group flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-fill-hover transition-colors"
					}
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
