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
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useMoveWorkspaceToComputer } from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { startWorkspaceMoveProgress } from "../../../../utils/startWorkspaceMoveProgress";
import { navigateToV2Workspace } from "../../../../utils/workspace-navigation";

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
	const navigate = useNavigate();
	const { machineId } = useLocalHostService();
	const { hosts } = useKnownHosts();
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);

	const computers = useMemo(() => {
		const others = hosts
			.filter(
				(host) =>
					host.machineId !== workspace.hostId &&
					host.machineId !== machineId &&
					!cloudWorkspaces.some((row) => row.id === host.machineId),
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
	}, [hosts, workspace.hostId, cloudWorkspaces, machineId]);
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
			toCloud: false,
			sourceWorkspaceId: workspace.id,
			retry: move,
		});
		onOpenChange(false);
		void moveWorkspaceToComputer({
			destination: { hostId: destination.hostId, name: destination.label },
			onStage: progress.setStage,
			onBegun: progress.begun,
			signal: progress.signal,
		})
			.then(({ toWorkspaceId, stayed, terminalsStayed }) => {
				progress.follow(toWorkspaceId, {
					stayed,
					open: () => void navigateToV2Workspace(toWorkspaceId, navigate),
				});
				void terminalsStayed.then(progress.alsoStayed);
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
							branch, and each Claude chat continues there, also Claude in a
							terminal. Agents that are working stop first. Other terminals and
							chats stay where they are.
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
