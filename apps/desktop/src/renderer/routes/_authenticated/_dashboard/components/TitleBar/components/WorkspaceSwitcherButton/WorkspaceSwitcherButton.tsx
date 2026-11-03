import { useLingui } from "@lingui/react/macro";
import { HEADER_ICON_STROKE_WIDTH } from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute } from "@tanstack/react-router";
import { ChevronDown, Layers } from "lucide-react";
import { openWorkspaceList } from "renderer/commandPalette";
import { HotkeyLabel } from "renderer/hotkeys";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";

/** The viewed workspace's name; it opens the workspace list, which starts with New workspace. */
export function WorkspaceSwitcherButton() {
	const { t } = useLingui();
	const matchRoute = useMatchRoute();
	const { workspaces } = useHostWorkspaces();
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
					onClick={openWorkspaceList}
					className="no-drag flex h-7 min-w-0 max-w-60 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				>
					<Layers
						className="size-4 shrink-0"
						strokeWidth={HEADER_ICON_STROKE_WIDTH}
					/>
					<span className="truncate font-medium text-foreground">
						{getV2WorkspaceDisplayName(workspace)}
					</span>
					<ChevronDown
						className="size-3.5 shrink-0"
						strokeWidth={HEADER_ICON_STROKE_WIDTH}
					/>
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
