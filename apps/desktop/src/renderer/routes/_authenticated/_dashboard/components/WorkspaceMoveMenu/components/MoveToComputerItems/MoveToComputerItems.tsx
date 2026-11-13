import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { LuLaptop } from "react-icons/lu";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOVE_MENU_PRIMITIVES, type MoveMenuKind } from "../../constants";

interface MoveToComputerItemsProps {
	menu: MoveMenuKind;
	/** The computer the workspace is on now, which is never a destination. */
	hostId: string;
	onSelectComputer: (destination: {
		hostId: string;
		name: string | null;
	}) => void;
}

export function MoveToComputerItems({
	menu,
	hostId,
	onSelectComputer,
}: MoveToComputerItemsProps) {
	const { Item, iconClassName } = MOVE_MENU_PRIMITIVES[menu];
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { hosts, settled } = useKnownHosts();
	const { workspaces: cloudWorkspaces = [], isLoading: cloudLoading } =
		useCloudWorkspaces();

	const computers = useMemo(() => {
		const others = hosts
			.filter(
				(host) =>
					host.machineId !== hostId &&
					host.machineId !== machineId &&
					!cloudWorkspaces.some((row) => row.id === host.machineId),
			)
			.map((host) => ({
				hostId: host.machineId,
				name: host.name as string | null,
				online: host.isOnline,
			}))
			.sort((a, b) => Number(b.online) - Number(a.online));
		const thisComputer =
			machineId && machineId !== hostId
				? [{ hostId: machineId, name: null, online: true }]
				: [];
		return [...thisComputer, ...others];
	}, [hosts, hostId, cloudWorkspaces, machineId]);

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
