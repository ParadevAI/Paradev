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
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Ellipsis, FolderPlus } from "lucide-react";
import { useId, useState } from "react";
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
import { RailAlertDot } from "../RailAlertDot";
import { SortableDestinationRow } from "./components/SortableDestinationRow";

interface RailMoreMenuProps {
	destinations: RailDestination[];
	isActive: boolean;
}

export function RailMoreMenu({ destinations, isActive }: RailMoreMenuProps) {
	const { t } = useLingui();
	const setPinned = useRailPinsStore((state) => state.setPinned);
	const setVisibleOrder = useRailPinsStore((state) => state.setVisibleOrder);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
	);
	const [isSorting, setIsSorting] = useState(false);
	const alertDescriptionId = useId();
	const offRailAlertLabel = destinations.find(
		(destination) =>
			!destination.isPinned && !destination.isActive && destination.alertLabel,
	)?.alertLabel;
	return (
		<DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "More" })}
							aria-describedby={
								offRailAlertLabel ? alertDescriptionId : undefined
							}
							aria-current={isActive ? "page" : undefined}
							className={railButtonClass(isActive)}
						>
							<Ellipsis
								className={RAIL_ICON_CLASS}
								strokeWidth={RAIL_ICON_STROKE_WIDTH}
							/>
							{offRailAlertLabel && (
								<>
									<RailAlertDot className="absolute top-2 right-2" />
									<span id={alertDescriptionId} className="sr-only">
										{offRailAlertLabel}
									</span>
								</>
							)}
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
				onEscapeKeyDown={(event) => {
					if (isSorting) event.preventDefault();
				}}
			>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={() => setIsSorting(true)}
					onDragCancel={() => setIsSorting(false)}
					onDragEnd={({ active, over }) => {
						setIsSorting(false);
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
								isSorting={isSorting}
								onTogglePinned={() =>
									setPinned(destination.id, !destination.isPinned)
								}
							/>
						))}
					</SortableContext>
				</DndContext>
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
