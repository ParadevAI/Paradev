import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { useNavigate } from "@tanstack/react-router";
import type { MoveDestinationComputer } from "../../../../hooks/useMoveDestinationComputers";
import { useMoveWorkspaceToComputer } from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { startWorkspaceMoveProgress } from "../../../../utils/startWorkspaceMoveProgress";
import { navigateToV2Workspace } from "../../../../utils/workspace-navigation";

/** Starts a move of `workspace` to a computer; its progress shows in a toast. */
export function useStartMoveToComputer(workspace: MovableWorkspace) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);

	const start = (destination: MoveDestinationComputer) => {
		const name = destination.isThisComputer ? null : destination.name;
		const progress = startWorkspaceMoveProgress({
			name: workspace.name,
			destination: name ?? t({ message: "this computer" }),
			toCloud: false,
			sourceWorkspaceId: workspace.id,
			retry: () => start(destination),
		});
		void moveWorkspaceToComputer({
			destination: { hostId: destination.hostId, name },
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
	return start;
}
