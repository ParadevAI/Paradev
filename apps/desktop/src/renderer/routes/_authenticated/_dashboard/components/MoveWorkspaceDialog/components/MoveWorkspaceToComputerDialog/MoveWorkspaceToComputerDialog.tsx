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
import { useState } from "react";
import {
	type MoveDestinationComputer,
	useMoveDestinationComputers,
} from "../../../../hooks/useMoveDestinationComputers";
import { useMoveWorkspaceToComputer } from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { startWorkspaceMoveProgress } from "../../../../utils/startWorkspaceMoveProgress";
import { navigateToV2Workspace } from "../../../../utils/workspace-navigation";

interface MoveWorkspaceToComputerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspace: MovableWorkspace;
	initialHostId?: string;
}

export function MoveWorkspaceToComputerDialog({
	open,
	onOpenChange,
	workspace,
	initialHostId,
}: MoveWorkspaceToComputerDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);
	const computers = useMoveDestinationComputers(workspace.hostId);
	const [picked, setPicked] = useState<string | null>(initialHostId ?? null);
	const destination =
		computers.find((computer) => computer.hostId === picked) ??
		computers.find((computer) => computer.online) ??
		null;
	const nameOf = (computer: MoveDestinationComputer) =>
		computer.isThisComputer ? null : computer.name;
	const labelOf = (computer: MoveDestinationComputer) =>
		nameOf(computer) ?? t({ message: "This computer" });
	const offlineLabel = (computer: MoveDestinationComputer) => {
		const computerName = labelOf(computer);
		return t({ message: `${computerName} (offline)` });
	};

	const move = () => {
		if (!destination?.online) return;
		const progress = startWorkspaceMoveProgress({
			name: workspace.name,
			destination: nameOf(destination) ?? t({ message: "this computer" }),
			toCloud: false,
			sourceWorkspaceId: workspace.id,
			retry: move,
		});
		onOpenChange(false);
		void moveWorkspaceToComputer({
			destination: { hostId: destination.hostId, name: nameOf(destination) },
			onStage: progress.setStage,
			onBegun: progress.begun,
			signal: progress.signal,
		})
			.then(({ toWorkspaceId, stayed }) =>
				progress.follow(toWorkspaceId, {
					stayed,
					open: () => void navigateToV2Workspace(toWorkspaceId, navigate),
				}),
			)
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
