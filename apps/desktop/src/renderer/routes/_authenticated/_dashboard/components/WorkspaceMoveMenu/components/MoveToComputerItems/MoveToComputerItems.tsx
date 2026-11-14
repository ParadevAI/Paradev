import { Trans, useLingui } from "@lingui/react/macro";
import { listMoveDestinationComputers } from "@superset/shared/move-book";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { LuLaptop } from "react-icons/lu";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import type { MenuParts } from "renderer/lib/menuParts";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface MoveToComputerItemsProps {
	parts: MenuParts;
	/** The computer the workspace is on now, which is never a destination. */
	hostId: string;
	onSelectComputer: (destination: {
		hostId: string;
		name: string | null;
	}) => void;
}

export function MoveToComputerItems({
	parts,
	hostId,
	onSelectComputer,
}: MoveToComputerItemsProps) {
	const { Item } = parts;
	const iconClassName = cn("size-4", parts.iconClassName);
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { hosts, settled } = useKnownHosts();
	const { workspaces: cloudWorkspaces = [], isLoading: cloudLoading } =
		useCloudWorkspaces();

	const computers = useMemo(
		() =>
			listMoveDestinationComputers({
				hosts,
				fromHostId: hostId,
				thisHostId: machineId ?? null,
				cloudHostIds: new Set(cloudWorkspaces.map((row) => row.id)),
			}).map((computer) => ({
				...computer,
				name: computer.isThisComputer ? null : computer.name,
			})),
		[hosts, hostId, cloudWorkspaces, machineId],
	);

	if (!settled || cloudLoading) {
		return (
			<Item disabled>
				<Trans>Loading…</Trans>
			</Item>
		);
	}
	if (computers.length === 0) {
		return (
			<Item disabled>
				<Trans>No other computer is set up for this account.</Trans>
			</Item>
		);
	}
	return (
		<>
			{computers.map((computer) => {
				const computerName = computer.name ?? t({ message: "This computer" });
				return (
					<Item
						key={computer.hostId}
						disabled={!computer.online}
						onSelect={() =>
							onSelectComputer({
								hostId: computer.hostId,
								name: computer.name,
							})
						}
					>
						<LuLaptop className={iconClassName} />
						<span className="truncate">
							{computer.online
								? computerName
								: t({ message: `${computerName} (offline)` })}
						</span>
					</Item>
				);
			})}
		</>
	);
}
