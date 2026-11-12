import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ComponentType, ReactNode } from "react";
import { LuCloudUpload, LuLaptop } from "react-icons/lu";
import { useMoveDestinationComputers } from "renderer/routes/_authenticated/_dashboard/hooks/useMoveDestinationComputers";
import type { WorkspaceMoveDirection } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";

export type MoveDestinationPick =
	| { direction: "to-cloud" }
	| { direction: "to-computer"; hostId: string };

/** `ContextMenuItem` or `DropdownMenuItem`. */
type MenuItem = ComponentType<{
	className?: string;
	disabled?: boolean;
	onSelect?: () => void;
	children: ReactNode;
}>;

interface MoveToDestinationItemsProps {
	item: MenuItem;
	iconClassName?: string;
	directions: WorkspaceMoveDirection[];
	fromHostId: string;
	onPick: (pick: MoveDestinationPick) => void;
}

export function MoveToDestinationItems({
	item: Item,
	iconClassName,
	directions,
	fromHostId,
	onPick,
}: MoveToDestinationItemsProps) {
	const { t } = useLingui();
	const computers = useMoveDestinationComputers(fromHostId);
	const toComputer = directions.includes("to-computer");
	const iconClass = cn("size-4 mt-0.5", iconClassName);

	return (
		<>
			{directions.includes("to-cloud") && (
				<Item
					className="items-start"
					onSelect={() => onPick({ direction: "to-cloud" })}
				>
					<LuCloudUpload className={iconClass} />
					<div className="flex flex-col">
						<Trans>Cloud</Trans>
						<span className="text-xs text-muted-foreground">
							<Trans>New cloud workspace</Trans>
						</span>
					</div>
				</Item>
			)}
			{toComputer &&
				computers.map((computer) => {
					const title = computer.isThisComputer
						? t({ message: "This computer" })
						: computer.name;
					const detail = computer.isThisComputer
						? computer.name
						: computer.online
							? t({ message: "Online" })
							: t({ message: "Offline" });
					return (
						<Item
							key={computer.hostId}
							className="items-start"
							disabled={!computer.online}
							onSelect={() =>
								onPick({ direction: "to-computer", hostId: computer.hostId })
							}
						>
							<LuLaptop className={iconClass} />
							<div className="flex flex-col">
								{title}
								{detail && (
									<span className="text-xs text-muted-foreground">
										{detail}
									</span>
								)}
							</div>
						</Item>
					);
				})}
			{toComputer && computers.length === 0 && (
				<Item disabled>
					<LuLaptop className={cn("size-4", iconClassName)} />
					<Trans>No other computer is set up for this account.</Trans>
				</Item>
			)}
		</>
	);
}
