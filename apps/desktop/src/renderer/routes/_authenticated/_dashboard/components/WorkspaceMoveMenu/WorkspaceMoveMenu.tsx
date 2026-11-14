import { Trans } from "@lingui/react/macro";
import { LuCloudUpload, LuLaptop, LuSend } from "react-icons/lu";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type {
	MovableWorkspace,
	WorkspaceMoveDirection,
} from "../../hooks/useWorkspaceMoveDirections";
import { MoveToCloudItems } from "./components/MoveToCloudItems";
import { MoveToComputerItems } from "./components/MoveToComputerItems";
import { MOVE_MENU_PRIMITIVES, type MoveMenuKind } from "./constants";
import { useStartWorkspaceMove } from "./hooks/useStartWorkspaceMove";

interface WorkspaceMoveMenuProps {
	menu: MoveMenuKind;
	workspace: MovableWorkspace;
	directions: WorkspaceMoveDirection[];
}

/** Move, with a submenu per destination; picking one starts the move. */
export function WorkspaceMoveMenu({
	menu,
	workspace,
	directions,
}: WorkspaceMoveMenuProps) {
	const { Sub, SubTrigger, SubContent, iconClassName } =
		MOVE_MENU_PRIMITIVES[menu];
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
								menu={menu}
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
								menu={menu}
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
