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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useState } from "react";
import { useWorkspaceMoveConfirmStore } from "renderer/stores/workspace-move-confirm/store";
import {
	type MoveDestinationComputer,
	useMoveDestinationComputers,
} from "../../../../hooks/useMoveDestinationComputers";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { useStartMoveToComputer } from "../../hooks/useStartMoveToComputer";

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
	const startMove = useStartMoveToComputer(workspace);
	const suppress = useWorkspaceMoveConfirmStore((state) => state.suppress);
	const computers = useMoveDestinationComputers(workspace.hostId);
	const [picked, setPicked] = useState<string | null>(initialHostId ?? null);
	const [dontAskAgain, setDontAskAgain] = useState(false);
	const destination =
		computers.find((computer) => computer.hostId === picked) ??
		computers.find((computer) => computer.online) ??
		null;
	const labelOf = (computer: MoveDestinationComputer) =>
		computer.isThisComputer || !computer.name
			? t({ message: "This computer" })
			: computer.name;
	const offlineLabel = (computer: MoveDestinationComputer) => {
		const computerName = labelOf(computer);
		return t({ message: `${computerName} (offline)` });
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
