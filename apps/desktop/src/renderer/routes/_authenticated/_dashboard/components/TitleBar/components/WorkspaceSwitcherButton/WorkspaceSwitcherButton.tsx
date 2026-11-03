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
					className="ml-0.5 flex h-7 min-w-0 max-w-60 items-center gap-1.5 rounded-lg px-1.5 font-semibold text-[13px] text-foreground transition-colors hover:bg-fill-hover"
				>
					<Layers
						className="size-3.5 shrink-0 text-muted-foreground"
						strokeWidth={HEADER_ICON_STROKE_WIDTH}
					/>
					<span className="flex min-w-0 items-center gap-[3px]">
						<span className="truncate">
							{getV2WorkspaceDisplayName(workspace)}
						</span>
						<ChevronDown
							className="size-[13px] shrink-0 text-muted-foreground"
							strokeWidth={HEADER_ICON_STROKE_WIDTH}
						/>
					</span>
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
