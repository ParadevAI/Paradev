import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CreateEnvironmentFlow } from "renderer/routes/_authenticated/components/CreateEnvironmentFlow";
import { EnvironmentPickerPill } from "renderer/routes/_authenticated/components/EnvironmentPickerPill";
import { MachineSizePickerPill } from "renderer/routes/_authenticated/components/MachineSizePickerPill";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";
import { resolveCloudChoices } from "renderer/routes/_authenticated/utils/resolveCloudChoices";
import {
	NO_PROJECT_KEY,
	useV2WorkspaceCreateDefaultsStore,
} from "renderer/stores/v2-workspace-create-defaults";
import { useMoveWorkspaceToCloud } from "../../../../hooks/useMoveWorkspaceToCloud";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirections";
import { startWorkspaceMoveProgress } from "../../../../utils/startWorkspaceMoveProgress";
import { useReportSkippedChats } from "../../hooks/useReportSkippedChats";

interface MoveWorkspaceToCloudDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspace: MovableWorkspace;
}

/** The description's text size, so the pickers read as part of it. */
const PICKER_TRIGGER_CLASS = "h-auto max-w-[240px] text-sm";

export function MoveWorkspaceToCloudDialog({
	open,
	onOpenChange,
	workspace,
}: MoveWorkspaceToCloudDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const [isCreatingEnvironment, setIsCreatingEnvironment] = useState(false);
	const moveWorkspaceToCloud = useMoveWorkspaceToCloud(workspace);
	const reportSkipped = useReportSkippedChats();
	const projectId = workspace.projectId;

	const { projects } = useHostProjects();
	const project = projects.find((row) => row.projectKey === projectId);
	const repositoryFullName =
		project?.repoOwner && project.repoName
			? `${project.repoOwner}/${project.repoName}`
			: null;
	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: open && !!organizationId },
	);
	const machineSizeOptions = useMachineSizeOptions();
	const cloudChoices = useV2WorkspaceCreateDefaultsStore(
		(state) => state.cloudChoices,
	);
	const setCloudChoice = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setCloudChoice,
	);
	const choiceKey = projectId ?? NO_PROJECT_KEY;
	const selection = useMemo(
		() =>
			resolveCloudChoices({
				environments: startableCloudEnvironments(environmentsQuery.data ?? []),
				projectId,
				repositoryFullName,
				choices: cloudChoices,
				offeredSizes: machineSizeOptions.options.map((option) => option.size),
				defaultSize: machineSizeOptions.defaultSize,
			}),
		[
			environmentsQuery.data,
			projectId,
			repositoryFullName,
			cloudChoices,
			machineSizeOptions,
		],
	);
	const environment = selection.environment;

	const move = () => {
		if (!environment) return;
		const progress = startWorkspaceMoveProgress({
			name: workspace.name,
			destination: t({ message: "the cloud" }),
			retry: move,
		});
		onOpenChange(false);
		void moveWorkspaceToCloud({
			environment: {
				id: environment.id,
				repositoryFullName: environment.repositories?.[0]?.fullName ?? null,
			},
			machineSize: selection.machineSize,
			onStage: (stage) =>
				progress.setStage(stage === "saving" ? "saving" : "creating"),
			signal: progress.signal,
		})
			.then(({ toWorkspaceId, skipped }) => {
				progress.follow(toWorkspaceId);
				reportSkipped(skipped);
			})
			.catch((error: unknown) =>
				progress.fail(
					isMissingProcedureError(error)
						? t({
								message:
									"Update the host service on this device and try again.",
							})
						: errorMessage(error, t({ message: "Unknown error" })),
				),
			);
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent onClick={(event) => event.stopPropagation()}>
					<DialogHeader>
						<DialogTitle>
							<Trans>Move this workspace to the cloud?</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Your work, including uncommitted changes, is pushed to a new
								branch on the remote. A cloud workspace starts from that branch
								in the environment you pick, and each Claude chat continues
								there. Agents that are working stop first. Terminals and other
								chats stay here.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-wrap items-center gap-2">
						<EnvironmentPickerPill
							triggerClassName={PICKER_TRIGGER_CLASS}
							selectedEnvironment={environment ?? undefined}
							linked={selection.linked}
							other={selection.other}
							projectName={project?.name}
							onSelectEnvironment={(environmentId) =>
								setCloudChoice(choiceKey, { environmentId })
							}
							onCreateEnvironment={() => setIsCreatingEnvironment(true)}
							onManageEnvironments={() => {
								onOpenChange(false);
								void navigate({ to: "/settings/environments" });
							}}
							isLoading={environmentsQuery.isLoading}
						/>
						<MachineSizePickerPill
							triggerClassName={PICKER_TRIGGER_CLASS}
							machineSize={selection.machineSize}
							onSelectMachineSize={(machineSize) =>
								setCloudChoice(choiceKey, { machineSize })
							}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button disabled={!environment} onClick={move}>
							<Trans>Move to cloud</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{organizationId && (
				<CreateEnvironmentFlow
					open={isCreatingEnvironment}
					onOpenChange={setIsCreatingEnvironment}
					organizationId={organizationId}
					projectId={projectId}
				/>
			)}
		</>
	);
}
