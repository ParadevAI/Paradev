import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
import { Ellipsis, FolderPlus, Gauge } from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AddProjectMenuItems } from "renderer/routes/_authenticated/_dashboard/components/AddProjectMenuItems";
import {
	RAIL_ICON_CLASS,
	RAIL_ICON_STROKE_WIDTH,
	railButtonClass,
} from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import type { RailDestination } from "../../hooks/useRailDestinations";
import {
	type RailDestinationId,
	useRailPinsStore,
} from "../../stores/railPinsStore";
import { SortableDestinationRow } from "./components/SortableDestinationRow";

interface RailMoreMenuProps {
	destinations: RailDestination[];
	onOpenUsage: () => void;
}

export function RailMoreMenu({ destinations, onOpenUsage }: RailMoreMenuProps) {
	const { t } = useLingui();
	const setPinned = useRailPinsStore((state) => state.setPinned);
	const setVisibleOrder = useRailPinsStore((state) => state.setVisibleOrder);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
	);
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
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={({ active, over }) => {
						if (!over || active.id === over.id) return;
						const ids = destinations.map(({ id }) => id);
						setVisibleOrder(
							arrayMove(
								ids,
								ids.indexOf(active.id as RailDestinationId),
								ids.indexOf(over.id as RailDestinationId),
							),
						);
					}}
				>
					<SortableContext
						items={destinations.map(({ id }) => id)}
						strategy={verticalListSortingStrategy}
					>
						{destinations.map((destination) => (
							<SortableDestinationRow
								key={destination.id}
								destination={destination}
								onTogglePinned={() =>
									setPinned(destination.id, !destination.isPinned)
								}
							/>
						))}
					</SortableContext>
				</DndContext>
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
