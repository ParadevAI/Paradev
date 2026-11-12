import { useState } from "react";
import { useWorkspaceMoveConfirmStore } from "renderer/stores/workspace-move-confirm/store";
import type { MovableWorkspace } from "../../hooks/useWorkspaceMoveDirections";
import type { MoveDestinationPick } from "../MoveToDestinationItems";
import { MoveWorkspaceToCloudDialog } from "./components/MoveWorkspaceToCloudDialog";
import { MoveWorkspaceToComputerDialog } from "./components/MoveWorkspaceToComputerDialog";
import { StartMoveToComputer } from "./components/StartMoveToComputer";

interface MoveWorkspaceDialogProps {
	pick: MoveDestinationPick;
	workspace: MovableWorkspace;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function MoveWorkspaceDialog({
	pick,
	...props
}: MoveWorkspaceDialogProps) {
	// Read once: ticking "Don't ask again" in the dialog must not start a second move.
	const [confirmSuppressed] = useState(
		() => useWorkspaceMoveConfirmStore.getState().suppressed,
	);
	if (pick.direction === "to-cloud")
		return <MoveWorkspaceToCloudDialog {...props} />;
	if (confirmSuppressed) {
		return (
			<StartMoveToComputer
				workspace={props.workspace}
				hostId={pick.hostId}
				onOpenChange={props.onOpenChange}
			/>
		);
	}
	return <MoveWorkspaceToComputerDialog {...props} hostId={pick.hostId} />;
}
