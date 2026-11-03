import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useLocation, useRouter } from "@tanstack/react-router";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";
// Temporarily hidden: import { HistoryDropdown } from "./components/HistoryDropdown";

export function NavigationControls() {
	const router = useRouter();
	const location = useLocation();

	const canGoBack = router.history.canGoBack();
	const canGoForward = location.state.__TSR_index < router.history.length - 1;

	return (
		<div className="flex items-center">
			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => router.history.back()}
						disabled={!canGoBack}
						className={cn("no-drag", HEADER_ICON_BUTTON_CLASS)}
					>
						<LuArrowLeft
							className="size-4"
							strokeWidth={HEADER_ICON_STROKE_WIDTH}
						/>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyLabel fallbackLabel="Go back" id="NAVIGATE_BACK" />
				</TooltipContent>
			</Tooltip>

			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => router.history.forward()}
						disabled={!canGoForward}
						className={cn("no-drag", HEADER_ICON_BUTTON_CLASS)}
					>
						<LuArrowRight
							className="size-4"
							strokeWidth={HEADER_ICON_STROKE_WIDTH}
						/>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyLabel fallbackLabel="Go forward" id="NAVIGATE_FORWARD" />
				</TooltipContent>
			</Tooltip>

			{/* Temporarily hidden: <HistoryDropdown /> */}
		</div>
	);
}
