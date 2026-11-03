import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { HotkeyLabel } from "renderer/hotkeys";

interface RightSidebarToggleProps {
	isOpen: boolean;
	onToggle: () => void;
	compact?: boolean;
}

export function RightSidebarToggle({
	isOpen,
	onToggle,
	compact = false,
}: RightSidebarToggleProps) {
	const isParadevShell = useParadevShell();
	const strokeWidth = isParadevShell ? HEADER_ICON_STROKE_WIDTH : 1.5;
	const getToggleIcon = (isHovering: boolean) => {
		if (!isOpen) {
			return isHovering ? (
				<LuPanelRightOpen className="size-4" strokeWidth={strokeWidth} />
			) : (
				<LuPanelRight className="size-4" strokeWidth={strokeWidth} />
			);
		}
		return isHovering ? (
			<LuPanelRightClose className="size-4" strokeWidth={strokeWidth} />
		) : (
			<LuPanelRight className="size-4" strokeWidth={strokeWidth} />
		);
	};

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onToggle}
					className={
						isParadevShell
							? cn("no-drag group", HEADER_ICON_BUTTON_CLASS)
							: cn(
									"no-drag group flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
									compact ? "size-7" : "size-8",
								)
					}
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="left">
				<HotkeyLabel fallbackLabel="Toggle sidebar" id="TOGGLE_SIDEBAR" />
			</TooltipContent>
		</Tooltip>
	);
}
