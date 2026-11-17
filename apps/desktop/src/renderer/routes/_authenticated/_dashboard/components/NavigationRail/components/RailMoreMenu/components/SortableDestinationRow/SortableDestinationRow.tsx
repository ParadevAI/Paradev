import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLingui } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { LuGripVertical, LuPin } from "react-icons/lu";
import { RAIL_ICON_STROKE_WIDTH } from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import type { RailDestination } from "../../../../hooks/useRailDestinations";

interface SortableDestinationRowProps {
	destination: RailDestination;
	onTogglePinned: () => void;
}

export function SortableDestinationRow({
	destination,
	onTogglePinned,
}: SortableDestinationRowProps) {
	const { t } = useLingui();
	const { icon: Icon, isIconFilled, isActive, isPinned } = destination;
	const { setNodeRef, listeners, isDragging, transform, transition } =
		useSortable({ id: destination.id });
	const pinLabel = isPinned ? t({ message: "Unpin" }) : t({ message: "Pin" });

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"group/row relative flex items-center gap-1",
				isDragging && "z-10 cursor-grabbing opacity-70",
			)}
			style={{
				transform: CSS.Translate.toString(
					transform ? { ...transform, x: 0 } : null,
				),
				transition,
			}}
			{...listeners}
		>
			<DropdownMenuItem
				onSelect={destination.onClick}
				aria-current={isActive ? "page" : undefined}
				className={cn("flex-1", isActive && "bg-fill-selected")}
			>
				<Icon
					className="size-4"
					{...(isIconFilled ? {} : { strokeWidth: RAIL_ICON_STROKE_WIDTH })}
				/>
				{destination.label}
			</DropdownMenuItem>
			<DropdownMenuItem
				aria-label={pinLabel}
				title={pinLabel}
				onSelect={(event) => {
					event.preventDefault();
					onTogglePinned();
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
			<LuGripVertical
				aria-hidden="true"
				className="size-3.5 shrink-0 cursor-grab text-muted-foreground/40 group-hover/row:text-muted-foreground"
			/>
		</div>
	);
}
