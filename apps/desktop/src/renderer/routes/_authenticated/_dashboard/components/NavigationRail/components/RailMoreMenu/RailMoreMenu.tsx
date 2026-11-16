import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
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
import { cn } from "@superset/ui/utils";
import { Ellipsis, FolderPlus, Gauge } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { PiChatsCircle } from "react-icons/pi";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AddProjectMenuItems } from "renderer/routes/_authenticated/_dashboard/components/AddProjectMenuItems";
import {
	RAIL_ICON_CLASS,
	RAIL_ICON_STROKE_WIDTH,
	railButtonClass,
} from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import { useDashboardNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDashboardNavigation";

export function RailMoreMenu() {
	const { t } = useLingui();
	const navigation = useDashboardNavigation();
	const isChannelsEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
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
							aria-current={navigation.isChannelsOpen ? "page" : undefined}
							className={railButtonClass(navigation.isChannelsOpen)}
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
				{isChannelsEnabled && (
					<DropdownMenuItem
						onSelect={navigation.openChannels}
						aria-current={navigation.isChannelsOpen ? "page" : undefined}
						className={cn(navigation.isChannelsOpen && "bg-fill-selected")}
					>
						<PiChatsCircle className="size-4" />
						<Trans>Chat</Trans>
					</DropdownMenuItem>
				)}
				{isUsageInSidebarEnabled && (
					<DropdownMenuItem onSelect={navigation.openUsage}>
						<Gauge className="size-4" />
						<Trans>Usage</Trans>
					</DropdownMenuItem>
				)}
				{(isChannelsEnabled || isUsageInSidebarEnabled) && (
					<DropdownMenuSeparator />
				)}
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
