import { Trans, useLingui } from "@lingui/react/macro";
import { ContextMenuItem } from "@superset/ui/context-menu";
import { LuCloudUpload, LuLaptop } from "react-icons/lu";
import { useMoveDestinationComputers } from "renderer/routes/_authenticated/_dashboard/hooks/useMoveDestinationComputers";
import type { WorkspaceMoveDirection } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";

export type MoveDestinationPick = {
	direction: WorkspaceMoveDirection;
	hostId?: string;
};

interface MoveToDestinationItemsProps {
	directions: WorkspaceMoveDirection[];
	fromHostId: string;
	onPick: (pick: MoveDestinationPick) => void;
}

export function MoveToDestinationItems({
	directions,
	fromHostId,
	onPick,
}: MoveToDestinationItemsProps) {
	const { t } = useLingui();
	const computers = useMoveDestinationComputers(fromHostId);
	const toComputer = directions.includes("to-computer");

	return (
		<>
			{directions.includes("to-cloud") && (
				<ContextMenuItem
					className="items-start"
					onSelect={() => onPick({ direction: "to-cloud" })}
				>
					<LuCloudUpload className="size-4 mr-2 mt-0.5" />
					<div className="flex flex-col">
						<Trans>Cloud</Trans>
						<span className="text-xs text-muted-foreground">
							<Trans>New cloud workspace</Trans>
						</span>
					</div>
				</ContextMenuItem>
			)}
			{toComputer &&
				computers.map((computer) => {
					const detail = computer.isThisComputer
						? computer.name && t({ message: "This computer" })
						: computer.online
							? t({ message: "Online" })
							: t({ message: "Offline" });
					return (
						<ContextMenuItem
							key={computer.hostId}
							className="items-start"
							disabled={!computer.online}
							onSelect={() =>
								onPick({ direction: "to-computer", hostId: computer.hostId })
							}
						>
							<LuLaptop className="size-4 mr-2 mt-0.5" />
							<div className="flex flex-col">
								{computer.name ?? t({ message: "This computer" })}
								{detail && (
									<span className="text-xs text-muted-foreground">
										{detail}
									</span>
								)}
							</div>
						</ContextMenuItem>
					);
				})}
			{toComputer && computers.length === 0 && (
				<ContextMenuItem disabled>
					<LuLaptop className="size-4 mr-2" />
					<Trans>No other computer is set up for this account.</Trans>
				</ContextMenuItem>
			)}
		</>
	);
}
