import { useEffect, useRef } from "react";
import { useMoveDestinationComputers } from "../../../../hooks/useMoveDestinationComputers";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { useStartMoveToComputer } from "../../hooks/useStartMoveToComputer";
import { MoveWorkspaceToComputerDialog } from "../MoveWorkspaceToComputerDialog";

interface StartMoveToComputerProps {
	workspace: MovableWorkspace;
	hostId: string;
	onOpenChange: (open: boolean) => void;
}

/**
 * Starts the move without asking, for a user who turned the dialog off. Shows
 * the dialog instead when the picked computer is not an online destination.
 */
export function StartMoveToComputer({
	workspace,
	hostId,
	onOpenChange,
}: StartMoveToComputerProps) {
	const startMove = useStartMoveToComputer(workspace);
	const destination = useMoveDestinationComputers(workspace.hostId).find(
		(computer) => computer.hostId === hostId && computer.online,
	);
	const started = useRef(false);

	useEffect(() => {
		if (!destination || started.current) return;
		started.current = true;
		onOpenChange(false);
		startMove(destination);
	}, [destination, onOpenChange, startMove]);

	if (destination) return null;
	return (
		<MoveWorkspaceToComputerDialog
			open
			onOpenChange={onOpenChange}
			workspace={workspace}
			initialHostId={hostId}
		/>
	);
}
