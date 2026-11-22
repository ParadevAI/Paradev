import { useLingui } from "@lingui/react/macro";
import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { SquarePen } from "lucide-react";
import { HotkeyLabel } from "renderer/hotkeys";
import { useOpenNewWorkspaceInViewedProject } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenNewWorkspaceInViewedProject";

export function NewWorkspaceButton() {
	const { t } = useLingui();
	const openNewWorkspace = useOpenNewWorkspaceInViewedProject();
	const label = t({ message: "New Workspace" });
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onClick={openNewWorkspace}
					className={HEADER_ICON_BUTTON_CLASS}
				>
					<SquarePen
						className="size-4"
						strokeWidth={HEADER_ICON_STROKE_WIDTH}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<HotkeyLabel label={label} id="NEW_WORKSPACE" />
			</TooltipContent>
		</Tooltip>
	);
}
