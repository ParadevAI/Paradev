import { Trans, useLingui } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { useState } from "react";
import { useWorkspaceMoveConfirmStore } from "renderer/stores/workspace-move-confirm/store";
import { useMoveDestinationComputers } from "../../../../hooks/useMoveDestinationComputers";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { useStartMoveToComputer } from "../../hooks/useStartMoveToComputer";

interface MoveWorkspaceToComputerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspace: MovableWorkspace;
	hostId: string;
}

export function MoveWorkspaceToComputerDialog({
	open,
	onOpenChange,
	workspace,
	hostId,
}: MoveWorkspaceToComputerDialogProps) {
	const { t } = useLingui();
	const startMove = useStartMoveToComputer(workspace);
	const suppress = useWorkspaceMoveConfirmStore((state) => state.suppress);
	const destination = useMoveDestinationComputers(workspace.hostId).find(
		(computer) => computer.hostId === hostId,
	);
	const [dontAskAgain, setDontAskAgain] = useState(false);
	const computerName = destination?.name;

	const copy = destination?.isThisComputer
		? {
				title: t({ message: "Move this workspace to this computer?" }),
				description: t({
					message:
						"Its work, including uncommitted changes, is pushed to a new branch. A workspace on this computer starts from that branch, and each Claude chat continues there. Agents that are working stop first. Terminals and other chats stay where they are.",
				}),
				offline: t({ message: "This computer is offline" }),
			}
		: computerName
			? {
					title: t({ message: `Move this workspace to ${computerName}?` }),
					description: t({
						message: `Its work, including uncommitted changes, is pushed to a new branch. A workspace on ${computerName} starts from that branch, and each Claude chat continues there. Agents that are working stop first. Terminals and other chats stay where they are.`,
					}),
					offline: t({ message: `${computerName} is offline` }),
				}
			: {
					title: t({ message: "Move this workspace to a computer?" }),
					description: t({
						message:
							"Its work, including uncommitted changes, is pushed to a new branch. A workspace on the computer you pick starts from that branch, and each Claude chat continues there. Agents that are working stop first. Terminals and other chats stay where they are.",
					}),
					offline: t({ message: "That computer is offline" }),
				};

	const move = () => {
		if (!destination?.online) return;
		if (dontAskAgain) suppress();
		onOpenChange(false);
		startMove(destination);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent onClick={(event) => event.stopPropagation()}>
				<AlertDialogHeader>
					<AlertDialogTitle>{copy.title}</AlertDialogTitle>
					<AlertDialogDescription>{copy.description}</AlertDialogDescription>
				</AlertDialogHeader>
				{destination?.online ? null : (
					<p className="text-sm text-muted-foreground">{copy.offline}</p>
				)}
				<AlertDialogFooter className="sm:justify-between">
					<div className="flex items-center gap-2">
						<Checkbox
							id="workspace-move-dont-ask-again"
							checked={dontAskAgain}
							onCheckedChange={(checked) => setDontAskAgain(checked === true)}
						/>
						<Label
							htmlFor="workspace-move-dont-ask-again"
							className="text-sm font-normal text-muted-foreground"
						>
							<Trans>Don't ask again</Trans>
						</Label>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button disabled={!destination?.online} onClick={move}>
							<Trans>Move</Trans>
						</Button>
					</div>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
