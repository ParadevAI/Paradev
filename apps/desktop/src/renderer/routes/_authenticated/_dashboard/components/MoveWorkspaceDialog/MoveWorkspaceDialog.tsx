import { useState } from "react";
import { useWorkspaceMoveConfirmStore } from "renderer/stores/workspace-move-confirm/store";
import type {
	MovableWorkspace,
	WorkspaceMoveDirection,
} from "../../hooks/useWorkspaceMoveDirections";
import { MoveWorkspaceToCloudDialog } from "./components/MoveWorkspaceToCloudDialog";
import { MoveWorkspaceToComputerDialog } from "./components/MoveWorkspaceToComputerDialog";
import { StartMoveToComputer } from "./components/StartMoveToComputer";

interface MoveWorkspaceDialogProps {
	direction: WorkspaceMoveDirection;
	workspace: MovableWorkspace;
	destinationHostId?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function MoveWorkspaceDialog({
	direction,
	destinationHostId,
	...props
}: MoveWorkspaceDialogProps) {
	// Read once: ticking "Don't ask again" in the dialog must not start a second move.
	const [confirmSuppressed] = useState(
		() => useWorkspaceMoveConfirmStore.getState().suppressed,
	);
	if (direction === "to-cloud")
		return <MoveWorkspaceToCloudDialog {...props} />;
	if (confirmSuppressed && destinationHostId) {
		return (
			<StartMoveToComputer
				workspace={props.workspace}
				hostId={destinationHostId}
				onOpenChange={props.onOpenChange}
			/>
		);
	}
	return (
		<MoveWorkspaceToComputerDialog
			{...props}
			initialHostId={destinationHostId}
		/>
	);
}
