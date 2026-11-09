import type {
	MovableWorkspace,
	WorkspaceMoveDirection,
} from "../../hooks/useWorkspaceMoveDirections";
import { MoveWorkspaceToCloudDialog } from "./components/MoveWorkspaceToCloudDialog";
import { MoveWorkspaceToComputerDialog } from "./components/MoveWorkspaceToComputerDialog";

interface MoveWorkspaceDialogProps {
	direction: WorkspaceMoveDirection;
	workspace: MovableWorkspace;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function MoveWorkspaceDialog({
	direction,
	...props
}: MoveWorkspaceDialogProps) {
	return direction === "to-cloud" ? (
		<MoveWorkspaceToCloudDialog {...props} />
	) : (
		<MoveWorkspaceToComputerDialog {...props} />
	);
}
