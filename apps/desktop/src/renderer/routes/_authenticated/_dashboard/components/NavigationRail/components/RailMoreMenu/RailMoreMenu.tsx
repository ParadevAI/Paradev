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
import type { RailDestination } from "../../hooks/useRailDestinations";
import { useRailPinsStore } from "../../stores/railPinsStore";

interface RailMoreMenuProps {
	destinations: RailDestination[];
	onOpenUsage: () => void;
}

export function RailMoreMenu({ destinations, onOpenUsage }: RailMoreMenuProps) {
	const { t } = useLingui();
	const setPinned = useRailPinsStore((state) => state.setPinned);
	const { data: isUsageInSidebarEnabled } =
		electronTrpc.settings.getShowUsageInSidebar.useQuery();
	const offRailBadge = destinations.find(
		(destination) => !destination.isPinned && !destination.isActive,
	)?.badge;
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
							{offRailBadge}
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
							<div key={id} className="flex items-center gap-1">
								<DropdownMenuItem
									onSelect={onClick}
									aria-current={isActive ? "page" : undefined}
									className={cn("flex-1", isActive && "bg-fill-selected")}
								>
									<Icon
										className="size-4"
										{...(isIconFilled
											? {}
											: { strokeWidth: RAIL_ICON_STROKE_WIDTH })}
									/>
									{label}
								</DropdownMenuItem>
								<DropdownMenuItem
									aria-label={pinLabel}
									title={pinLabel}
									onSelect={(event) => {
										event.preventDefault();
										setPinned(id, !isPinned);
									}}
									className="size-7 justify-center p-0"
								>
									<LuPin
										className={cn(
											"size-3.5",
											isPinned
												? "fill-current text-foreground"
												: "text-muted-foreground/50",
										)}
									/>
								</DropdownMenuItem>
							</div>
						);
					},
				)}
				{isUsageInSidebarEnabled && (
					<DropdownMenuItem onSelect={onOpenUsage}>
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
