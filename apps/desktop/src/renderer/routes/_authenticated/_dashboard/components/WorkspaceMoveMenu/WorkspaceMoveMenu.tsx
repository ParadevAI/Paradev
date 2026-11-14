import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuCloudUpload, LuLaptop, LuSend } from "react-icons/lu";
import type { MenuParts } from "renderer/lib/menuParts";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type {
	MovableWorkspace,
	WorkspaceMoveDirection,
} from "../../hooks/useWorkspaceMoveDirections";
import { MoveToCloudItems } from "./components/MoveToCloudItems";
import { MoveToComputerItems } from "./components/MoveToComputerItems";
import { useStartWorkspaceMove } from "./hooks/useStartWorkspaceMove";

interface WorkspaceMoveMenuProps {
	parts: MenuParts;
	workspace: MovableWorkspace;
	directions: WorkspaceMoveDirection[];
}

/** Move, with a submenu per destination; picking one starts the move. */
export function WorkspaceMoveMenu({
	parts,
	workspace,
	directions,
}: WorkspaceMoveMenuProps) {
	const { Sub, SubTrigger, SubContent } = parts;
	const iconClassName = cn("size-4", parts.iconClassName);
	const { machineId } = useLocalHostService();
	const startMove = useStartWorkspaceMove(workspace);

	return (
		<Sub>
			<SubTrigger>
				<LuSend className={iconClassName} />
				<Trans>Move</Trans>
			</SubTrigger>
			<SubContent>
				{directions.includes("to-cloud") && (
					<Sub>
						<SubTrigger>
							<LuCloudUpload className={iconClassName} />
							<Trans>Cloud</Trans>
						</SubTrigger>
						<SubContent>
							<MoveToCloudItems
								parts={parts}
								projectId={workspace.projectId}
								onSelectEnvironment={startMove.toCloud}
							/>
						</SubContent>
					</Sub>
				)}
				{directions.includes("to-computer") && (
					<Sub>
						<SubTrigger>
							<LuLaptop className={iconClassName} />
							{workspace.hostId === machineId ? (
								<Trans>Another computer</Trans>
							) : (
								<Trans>A computer</Trans>
							)}
						</SubTrigger>
						<SubContent>
							<MoveToComputerItems
								parts={parts}
								hostId={workspace.hostId}
								onSelectComputer={startMove.toComputer}
							/>
						</SubContent>
					</Sub>
				)}
			</SubContent>
		</Sub>
	);
}
