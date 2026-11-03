import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Ellipsis, FolderPlus, Gauge, Layers } from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AddProjectMenuItems } from "renderer/routes/_authenticated/_dashboard/components/AddProjectMenuItems";
import { useDashboardNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDashboardNavigation";
import {
	RAIL_ICON_CLASS,
	RAIL_ICON_STROKE_WIDTH,
	railButtonClass,
} from "../RailButton";

export function RailMoreMenu() {
	const { t } = useLingui();
	const navigation = useDashboardNavigation();
	const { data: isUsageInSidebarEnabled } =
		electronTrpc.settings.getShowUsageInSidebar.useQuery();
	return (
		<DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "More" })}
							className={railButtonClass(navigation.isWorkspacesOpen)}
						>
							<Ellipsis
								className={RAIL_ICON_CLASS}
								strokeWidth={RAIL_ICON_STROKE_WIDTH}
							/>
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">
					<Trans>More</Trans>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				side="right"
				align="start"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuItem onSelect={navigation.openWorkspaces}>
					<Layers className="size-4" />
					<Trans>Workspaces</Trans>
				</DropdownMenuItem>
				{isUsageInSidebarEnabled && (
					<DropdownMenuItem onSelect={navigation.openUsage}>
						<Gauge className="size-4" />
						<Trans>Usage</Trans>
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<FolderPlus className="size-4" />
						<Trans>Add project</Trans>
					</DropdownMenuSubTrigger>
					<DropdownMenuPortal>
						<DropdownMenuSubContent>
							<AddProjectMenuItems />
						</DropdownMenuSubContent>
					</DropdownMenuPortal>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
