import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { LuPin, LuPinOff } from "react-icons/lu";
import { RailButton } from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import type { RailDestination } from "../../hooks/useRailDestinations";
import { useRailPinsStore } from "../../stores/railPinsStore";

interface PinnableRailButtonProps {
	destination: RailDestination;
}

export function PinnableRailButton({ destination }: PinnableRailButtonProps) {
	const setPinned = useRailPinsStore((state) => state.setPinned);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div>
					<RailButton
						label={destination.railLabel ?? destination.label}
						icon={destination.icon}
						isIconFilled={destination.isIconFilled}
						isActive={destination.isActive}
						onClick={destination.onClick}
						badge={destination.badge}
					/>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					onSelect={() => setPinned(destination.id, !destination.isPinned)}
				>
					{destination.isPinned ? (
						<>
							<LuPinOff className="size-4" />
							<Trans>Unpin</Trans>
						</>
					) : (
						<>
							<LuPin className="size-4" />
							<Trans>Pin</Trans>
						</>
					)}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
