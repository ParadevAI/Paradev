import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { useNavigate } from "@tanstack/react-router";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";
import { resolveCloudChoices } from "renderer/routes/_authenticated/utils/resolveCloudChoices";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useMoveWorkspaceToCloud } from "../../../../hooks/useMoveWorkspaceToCloud";
import { useMoveWorkspaceToComputer } from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import {
	startWorkspaceMoveProgress,
	type WorkspaceMoveProgressHandle,
} from "../../../../utils/startWorkspaceMoveProgress";
import { navigateToV2Workspace } from "../../../../utils/workspace-navigation";

type MoveResult = {
	toWorkspaceId: string;
	stayed: string[];
	terminalsStayed: Promise<string[]>;
};

/**
 * Starts a move as soon as its destination is picked. Progress, cancel and
 * retry live in the move toast.
 */
export function useStartWorkspaceMove(workspace: MovableWorkspace) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const moveWorkspaceToCloud = useMoveWorkspaceToCloud(workspace);
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);
	const cloudChoices = useV2WorkspaceCreateDefaultsStore(
		(state) => state.cloudChoices,
	);
	const machineSizeOptions = useMachineSizeOptions();
	const { machineSize } = resolveCloudChoices({
		environments: [],
		projectId: workspace.projectId,
		repositoryFullName: null,
		choices: cloudChoices,
		offeredSizes: machineSizeOptions.options.map((option) => option.size),
		defaultSize: machineSizeOptions.defaultSize,
	});

	const follow = (
		progress: WorkspaceMoveProgressHandle,
		{ toWorkspaceId, stayed, terminalsStayed }: MoveResult,
	) => {
		progress.follow(toWorkspaceId, {
			stayed,
			open: () => void navigateToV2Workspace(toWorkspaceId, navigate),
		});
		void terminalsStayed.then(progress.alsoStayed);
	};
	const failWith =
		(progress: WorkspaceMoveProgressHandle, updateHint: string) =>
		(error: unknown) =>
			progress.fail(
				isMissingProcedureError(error)
					? updateHint
					: errorMessage(error, t({ message: "Unknown error" })),
			);

	const toCloud = (environment: {
		id: string;
		repositoryFullName: string | null;
	}) => {
		const start = () => {
			const progress = startWorkspaceMoveProgress({
				name: workspace.name,
				destination: t({ message: "the cloud" }),
				toCloud: true,
				sourceWorkspaceId: workspace.id,
				retry: start,
			});
			void moveWorkspaceToCloud({
				environment,
				machineSize,
				onStage: (stage) =>
					progress.setStage(stage === "saving" ? "saving" : "creating"),
				onBegun: progress.begun,
				signal: progress.signal,
			})
				.then((result) => follow(progress, result))
				.catch(
					failWith(
						progress,
						t({
							message: "Update the host service on this device and try again.",
						}),
					),
				);
		};
		start();
	};

	const toComputer = (destination: { hostId: string; name: string | null }) => {
		const start = () => {
			const progress = startWorkspaceMoveProgress({
				name: workspace.name,
				destination: destination.name ?? t({ message: "this computer" }),
				toCloud: false,
				sourceWorkspaceId: workspace.id,
				retry: start,
			});
			void moveWorkspaceToComputer({
				destination,
				onStage: progress.setStage,
				onBegun: progress.begun,
				signal: progress.signal,
			})
				.then((result) => follow(progress, result))
				.catch(
					failWith(
						progress,
						t({
							message:
								"Update the host service on both computers and try again.",
						}),
					),
				);
		};
		start();
	};

	return { toCloud, toComputer };
}
