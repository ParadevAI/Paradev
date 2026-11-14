import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { useNavigate } from "@tanstack/react-router";
import { useMoveWorkspaceToCloud } from "../../../../hooks/useMoveWorkspaceToCloud";
import { useMoveWorkspaceToComputer } from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import type { TerminalHandoff } from "../../../../utils/handOffTerminals";
import {
	startWorkspaceMoveProgress,
	type WorkspaceMoveProgressHandle,
} from "../../../../utils/startWorkspaceMoveProgress";
import { navigateToV2Workspace } from "../../../../utils/workspace-navigation";

type MoveResult = {
	toWorkspaceId: string;
	stayed: string[];
	terminalHandoff: Promise<TerminalHandoff>;
	movingTerminals: boolean;
};

function isAgentBusyError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"data" in error &&
		(error.data as { code?: string } | undefined)?.code ===
			"PRECONDITION_FAILED" &&
		/wait for the agent to finish/i.test(error.message)
	);
}

/**
 * Starts a move as soon as its destination is picked. A working agent is
 * only stopped after the move failed for it once and the person tried again
 * from the toast. Progress, cancel and retry live in the move toast. A cloud
 * move takes its machine size from the environment.
 */
export function useStartWorkspaceMove(workspace: MovableWorkspace) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const moveWorkspaceToCloud = useMoveWorkspaceToCloud(workspace);
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);

	const follow = (
		progress: WorkspaceMoveProgressHandle,
		{ toWorkspaceId, stayed, terminalHandoff, movingTerminals }: MoveResult,
	) =>
		progress.follow(toWorkspaceId, {
			stayed,
			open: () => void navigateToV2Workspace(toWorkspaceId, navigate),
			terminals: terminalHandoff,
			terminalsPending: movingTerminals,
		});

	const failWith =
		(
			progress: WorkspaceMoveProgressHandle,
			updateHint: string,
			onBusy: () => void,
		) =>
		(error: unknown) => {
			if (isAgentBusyError(error)) {
				onBusy();
				progress.fail(
					t({
						message:
							"An agent here is still working. Try again to stop it and move.",
					}),
				);
				return;
			}
			progress.fail(
				isMissingProcedureError(error)
					? updateHint
					: errorMessage(error, t({ message: "Unknown error" })),
			);
		};

	const toCloud = (environment: {
		id: string;
		repositoryFullName: string | null;
	}) => {
		const start = (stopIfBusy: boolean) => {
			let stopNextTime = false;
			const progress = startWorkspaceMoveProgress({
				name: workspace.name,
				destination: t({ message: "the cloud" }),
				toCloud: true,
				sourceWorkspaceId: workspace.id,
				retry: () => start(stopNextTime),
			});
			void moveWorkspaceToCloud({
				environment,
				stopIfBusy,
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
						() => {
							stopNextTime = true;
						},
					),
				);
		};
		start(false);
	};

	const toComputer = (destination: { hostId: string; name: string | null }) => {
		const start = (stopIfBusy: boolean) => {
			let stopNextTime = false;
			const progress = startWorkspaceMoveProgress({
				name: workspace.name,
				destination: destination.name ?? t({ message: "this computer" }),
				toCloud: false,
				sourceWorkspaceId: workspace.id,
				retry: () => start(stopNextTime),
			});
			void moveWorkspaceToComputer({
				destination,
				stopIfBusy,
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
						() => {
							stopNextTime = true;
						},
					),
				);
		};
		start(false);
	};

	return { toCloud, toComputer };
}
