import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuArrowRightLeft } from "react-icons/lu";
import type { MenuParts } from "renderer/lib/menuParts";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
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

/** Move to: Cloud with its environments, then the hosts; picking one starts the move. */
export function WorkspaceMoveMenu({
	parts,
	workspace,
	directions,
}: WorkspaceMoveMenuProps) {
	const { Sub, SubTrigger, SubContent, Separator } = parts;
	const iconClassName = cn("size-4", parts.iconClassName);
	const startMove = useStartWorkspaceMove(workspace);

	return (
		<Sub>
			<SubTrigger>
				<LuArrowRightLeft className={iconClassName} />
				<Trans>Move to</Trans>
			</SubTrigger>
			<SubContent>
				{directions.includes("to-cloud") && (
					<Sub>
						<SubTrigger>
							<CloudGlyph className={iconClassName} />
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
				{directions.includes("to-cloud") &&
					directions.includes("to-computer") && <Separator />}
				{directions.includes("to-computer") && (
					<MoveToComputerItems
						parts={parts}
						hostId={workspace.hostId}
						onSelectComputer={startMove.toComputer}
					/>
				)}
			</SubContent>
		</Sub>
	);
}
