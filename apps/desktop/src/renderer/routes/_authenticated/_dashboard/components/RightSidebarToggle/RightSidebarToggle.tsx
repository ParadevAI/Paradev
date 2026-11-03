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
import { HotkeyLabel } from "renderer/hotkeys";

interface RightSidebarToggleProps {
	isOpen: boolean;
	onToggle: () => void;
}

export function RightSidebarToggle({
	isOpen,
	onToggle,
}: RightSidebarToggleProps) {
	const getToggleIcon = (isHovering: boolean) => {
		if (!isOpen) {
			return isHovering ? (
				<LuPanelRightOpen
					className="size-4"
					strokeWidth={HEADER_ICON_STROKE_WIDTH}
				/>
			) : (
				<LuPanelRight
					className="size-4"
					strokeWidth={HEADER_ICON_STROKE_WIDTH}
				/>
			);
		}
		return isHovering ? (
			<LuPanelRightClose
				className="size-4"
				strokeWidth={HEADER_ICON_STROKE_WIDTH}
			/>
		) : (
			<LuPanelRight className="size-4" strokeWidth={HEADER_ICON_STROKE_WIDTH} />
		);
	};

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onToggle}
					className={cn("no-drag group", HEADER_ICON_BUTTON_CLASS)}
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
