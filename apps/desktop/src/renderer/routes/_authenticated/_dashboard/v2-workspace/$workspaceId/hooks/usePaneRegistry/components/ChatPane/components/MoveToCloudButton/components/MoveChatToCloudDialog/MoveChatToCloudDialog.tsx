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
import { toast } from "@superset/ui/sonner";
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
import {
	type MoveToCloudStage,
	useMoveChatToCloud,
} from "../../../../hooks/useMoveChatToCloud";

interface MoveChatToCloudDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	projectId: string | null;
	chatSessionId: string;
	name: string;
}

/** The description's text size, so the pickers read as part of it. */
const PICKER_TRIGGER_CLASS = "h-auto max-w-[240px] text-sm";

export function MoveChatToCloudDialog({
	open,
	onOpenChange,
	workspaceId,
	projectId,
	chatSessionId,
	name,
}: MoveChatToCloudDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const [stage, setStage] = useState<MoveToCloudStage | null>(null);
	const isMoving = stage !== null;
	const [isCreatingEnvironment, setIsCreatingEnvironment] = useState(false);
	const moveChatToCloud = useMoveChatToCloud(workspaceId);

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

	const move = async () => {
		if (!environment) return;
		setStage("saving");
		try {
			await moveChatToCloud({
				chatSessionId,
				name,
				environment: {
					id: environment.id,
					repositoryFullName: environment.repositories?.[0]?.fullName ?? null,
				},
				machineSize: selection.machineSize,
				onStage: setStage,
			});
			onOpenChange(false);
		} catch (error) {
			toast.error(t({ message: "Couldn't move this chat to the cloud" }), {
				description: isMissingProcedureError(error)
					? t({
							message: "Update the host service on this device and try again.",
						})
					: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setStage(null);
		}
	};

	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (!isMoving) onOpenChange(nextOpen);
				}}
			>
				<DialogContent onClick={(event) => event.stopPropagation()}>
					<DialogHeader>
						<DialogTitle>
							<Trans>Move this chat to the cloud?</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Your current work, including uncommitted changes, is pushed to a
								new branch on the remote. A cloud workspace starts from that
								branch in the environment you pick, and this conversation
								continues there. If the agent is working, it stops first.
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
					{stage && (
						<p className="text-sm text-muted-foreground" aria-live="polite">
							{stage === "saving" ? (
								<Trans>Saving your work and this conversation…</Trans>
							) : (
								<Trans>Starting the cloud workspace…</Trans>
							)}
						</p>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							disabled={isMoving}
							onClick={() => onOpenChange(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={isMoving || !environment}
							onClick={() => void move()}
						>
							{isMoving ? (
								<Trans>Moving...</Trans>
							) : (
								<Trans>Move to cloud</Trans>
							)}
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
