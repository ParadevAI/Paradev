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
import { cn } from "@superset/ui/utils";
import { Ellipsis, FolderPlus, Gauge } from "lucide-react";
import { LuPin } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AddProjectMenuItems } from "renderer/routes/_authenticated/_dashboard/components/AddProjectMenuItems";
import {
	RAIL_ICON_CLASS,
	RAIL_ICON_STROKE_WIDTH,
	railButtonClass,
} from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import { useDashboardNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDashboardNavigation";
import type { RailDestination } from "../../hooks/useRailDestinations";
import { useRailPinsStore } from "../../stores/railPinsStore";

interface RailMoreMenuProps {
	destinations: RailDestination[];
}

export function RailMoreMenu({ destinations }: RailMoreMenuProps) {
	const { t } = useLingui();
	const navigation = useDashboardNavigation();
	const setPinned = useRailPinsStore((state) => state.setPinned);
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
							className={railButtonClass(false)}
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
				{destinations.map(
					({
						id,
						label,
						icon: Icon,
						isIconFilled,
						isActive,
						isPinned,
						onClick,
					}) => {
						const pinLabel = isPinned
							? t({ message: "Unpin" })
							: t({ message: "Pin" });
						return (
							<DropdownMenuItem
								key={id}
								onSelect={onClick}
								aria-current={isActive ? "page" : undefined}
								className={cn(isActive && "bg-fill-selected")}
							>
								<Icon
									className="size-4"
									{...(isIconFilled
										? {}
										: { strokeWidth: RAIL_ICON_STROKE_WIDTH })}
								/>
								<span className="flex-1">{label}</span>
								<button
									type="button"
									aria-label={pinLabel}
									aria-pressed={isPinned}
									title={pinLabel}
									onClick={(event) => {
										event.stopPropagation();
										setPinned(id, !isPinned);
									}}
									className="group/pin -my-1 -mr-1 ml-4 flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-fill-hover"
								>
									<LuPin
										className={cn(
											"size-3.5 transition-colors group-hover/pin:text-foreground",
											isPinned
												? "fill-current text-foreground"
												: "text-muted-foreground/50",
										)}
									/>
								</button>
							</DropdownMenuItem>
						);
					},
				)}
				{isUsageInSidebarEnabled && (
					<DropdownMenuItem onSelect={navigation.openUsage}>
						<Gauge className="size-4" />
						<Trans>Usage</Trans>
					</DropdownMenuItem>
				)}
				{(destinations.length > 0 || isUsageInSidebarEnabled) && (
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
