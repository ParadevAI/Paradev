import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMemo, useState } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useMoveWorkspaceToComputer } from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { startWorkspaceMoveProgress } from "../../../../utils/startWorkspaceMoveProgress";
import { useReportSkippedChats } from "../../hooks/useReportSkippedChats";

interface MoveWorkspaceToComputerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspace: MovableWorkspace;
}

export function MoveWorkspaceToComputerDialog({
	open,
	onOpenChange,
	workspace,
}: MoveWorkspaceToComputerDialogProps) {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { hosts } = useKnownHosts();
	const { cache } = useHostWorkspaces();
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);
	const reportSkipped = useReportSkippedChats();

	const computers = useMemo(() => {
		const others = hosts
			.filter(
				(host) =>
					host.machineId !== workspace.hostId &&
					host.machineId !== machineId &&
					!cache.isSandboxHost(host.machineId),
			)
			.map((host) => ({
				hostId: host.machineId,
				label: host.name as string | null,
				online: host.isOnline,
			}))
			.sort((a, b) => Number(b.online) - Number(a.online));
		const thisComputer =
			machineId && machineId !== workspace.hostId
				? [{ hostId: machineId, label: null, online: true }]
				: [];
		return [...thisComputer, ...others];
	}, [hosts, workspace.hostId, cache, machineId]);
	const [picked, setPicked] = useState<string | null>(null);
	const destination =
		computers.find((computer) => computer.hostId === picked) ??
		computers.find((computer) => computer.online) ??
		null;
	const labelOf = (computer: (typeof computers)[number]) =>
		computer.label ?? t({ message: "This computer" });
	const offlineLabel = (computer: (typeof computers)[number]) => {
		const computerName = labelOf(computer);
		return t({ message: `${computerName} (offline)` });
	};

	const move = () => {
		if (!destination?.online) return;
		const progress = startWorkspaceMoveProgress({
			name: workspace.name,
			destination: destination.label ?? t({ message: "this computer" }),
			retry: move,
		});
		onOpenChange(false);
		void moveWorkspaceToComputer({
			destination: { hostId: destination.hostId, name: destination.label },
			onStage: progress.setStage,
			signal: progress.signal,
		})
			.then(({ toWorkspaceId, skipped }) => {
				progress.follow(toWorkspaceId);
				reportSkipped(skipped);
			})
			.catch((error: unknown) =>
				progress.fail(
					isMissingProcedureError(error)
						? t({
								message:
									"Update the host service on both computers and try again.",
							})
						: errorMessage(error, t({ message: "Unknown error" })),
				),
			);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent onClick={(event) => event.stopPropagation()}>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Move this workspace to a computer?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							Its work, including uncommitted changes, is pushed to a new
							branch. A workspace on the computer you pick starts from that
							branch, and each Claude chat continues there. Agents that are
							working stop first. Terminals and other chats stay where they are.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				{computers.length > 0 ? (
					<Select
						value={destination?.hostId}
						onValueChange={(hostId) => setPicked(hostId)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{computers.map((computer) => (
								<SelectItem
									key={computer.hostId}
									value={computer.hostId}
									disabled={!computer.online}
								>
									{computer.online ? labelOf(computer) : offlineLabel(computer)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<p className="text-sm text-muted-foreground">
						<Trans>No other computer is set up for this account.</Trans>
					</p>
				)}
				<AlertDialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button disabled={!destination?.online} onClick={move}>
						<Trans>Move</Trans>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
