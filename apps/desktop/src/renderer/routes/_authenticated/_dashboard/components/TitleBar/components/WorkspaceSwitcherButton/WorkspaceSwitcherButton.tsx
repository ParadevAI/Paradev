import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	PALETTE_TOGGLE_ATTRIBUTE,
	toggleWorkspaceList,
	useFrameStackStore,
} from "renderer/commandPalette";
import { HotkeyLabel } from "renderer/hotkeys";
import { WorkspacesIcon } from "./components/WorkspacesIcon";
import {
	useWaitingWorkspaceBucket,
	type WaitingWorkspaceBucket,
} from "./hooks/useWaitingWorkspaceBucket";

const WAITING_DOT_CLASS: Record<WaitingWorkspaceBucket, string> = {
	needsInput: "bg-amber-400",
	failed: "bg-red-500",
	completed: "bg-green-500",
};

export function WorkspaceSwitcherButton() {
	const { t } = useLingui();
	const waiting = useWaitingWorkspaceBucket();
	const isOpen = useFrameStackStore((s) => s.open && s.root === "switcher");
	const label = t({ message: "Switch workspace" });

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-haspopup="dialog"
					aria-expanded={isOpen}
					aria-label={label}
					{...{ [PALETTE_TOGGLE_ATTRIBUTE]: "" }}
					onClick={toggleWorkspaceList}
					className="no-drag mx-1.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--header-tab-selected,var(--card))] text-foreground ring-1 ring-input transition-colors hover:bg-[image:linear-gradient(var(--fill-hover),var(--fill-hover))]"
				>
					<span className="relative flex">
						<WorkspacesIcon className="size-4" />
						{waiting ? (
							<span
								aria-hidden="true"
								className={cn(
									"-top-0.5 -right-0.5 absolute size-1.5 rounded-full ring-[1.5px] ring-[var(--header-tab-selected,var(--card))]",
									WAITING_DOT_CLASS[waiting],
								)}
							/>
						) : null}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<HotkeyLabel label={label} id="OPEN_WORKSPACE_LIST" />
			</TooltipContent>
		</Tooltip>
	);
}
