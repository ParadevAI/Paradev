import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute } from "@tanstack/react-router";
import { openWorkspaceList } from "renderer/commandPalette";
import { HotkeyLabel } from "renderer/hotkeys";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { WorkspacesIcon } from "./components/WorkspacesIcon";
import {
	useWaitingWorkspaceBucket,
	type WaitingWorkspaceBucket,
} from "./hooks/useWaitingWorkspaceBucket";

const WAITING_DOT_CLASS: Record<WaitingWorkspaceBucket, string> = {
	needsInput: "bg-amber-400",
	completed: "bg-green-500",
};

/** Opens the workspace switcher. Its dot shows when another sidebar workspace waits on the user. */
export function WorkspaceSwitcherButton() {
	const { t } = useLingui();
	const matchRoute = useMatchRoute();
	const { workspaces } = useHostWorkspaces();
	const waiting = useWaitingWorkspaceBucket();
	const match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const workspace =
		match !== false
			? workspaces.find((candidate) => candidate.id === match.workspaceId)
			: undefined;
	if (!workspace) return null;

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-haspopup="dialog"
					aria-label={t({ message: "Switch workspace" })}
					onClick={() => openWorkspaceList({ via: "pill" })}
					className="no-drag relative mx-1.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tab-selected)] text-foreground shadow-[var(--tab-selected-shadow)] transition-colors hover:bg-[var(--tab-switcher-hover)]"
				>
					<WorkspacesIcon className="size-4" />
					{waiting ? (
						<span
							aria-hidden="true"
							className={cn(
								"-top-0.5 -right-0.5 absolute size-2 rounded-full ring-2 ring-shell-frame",
								WAITING_DOT_CLASS[waiting],
							)}
						/>
					) : null}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<HotkeyLabel
					label={t({ message: "Switch workspace" })}
					id="OPEN_WORKSPACE_LIST"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
