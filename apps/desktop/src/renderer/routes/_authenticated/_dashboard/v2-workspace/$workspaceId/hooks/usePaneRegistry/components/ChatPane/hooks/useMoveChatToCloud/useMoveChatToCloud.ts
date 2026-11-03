import { useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { seedMovedChat } from "renderer/stores/workspace-creates/seedMovedChat";

export type MoveToCloudStage = "saving" | "starting";

export function useMoveChatToCloud(workspaceId: string) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { trpcClient } = useWorkspaceClient();
	const organizationId = useActiveOrganizationId();
	const collections = useCollections();
	const utils = cloudTrpc.useUtils();
	const { workspace } = useWorkspace();
	const sourceHostId = workspace.hostId;
	const { projects } = useHostProjects();
	const sourceProject = projects.find(
		(row) => row.projectKey === workspace.projectId,
	);
	const sourceRepository =
		sourceProject?.repoOwner && sourceProject.repoName
			? `${sourceProject.repoOwner}/${sourceProject.repoName}`
			: null;

	return useCallback(
		async ({
			chatSessionId,
			name,
			environment,
			machineSize,
			onStage,
		}: {
			chatSessionId: string;
			name: string;
			environment: { id: string; repositoryFullName: string | null };
			machineSize: MachineSize;
			onStage: (stage: MoveToCloudStage) => void;
		}) => {
			if (!organizationId) throw new Error(t`No active organization`);
			const assertEnvironmentOpens = (chatRepository: string) => {
				const environmentRepository = environment.repositoryFullName;
				if (
					environmentRepository &&
					environmentRepository.toLowerCase() !== chatRepository.toLowerCase()
				) {
					throw new Error(
						t`This environment opens ${environmentRepository}, not ${chatRepository}`,
					);
				}
			};
			if (sourceRepository) assertEnvironmentOpens(sourceRepository);
			onStage("saving");
			const prepared = await trpcClient.teleport.prepare.mutate({
				workspaceId,
				chatSessionId,
				stopIfBusy: true,
			});
			assertEnvironmentOpens(prepared.repositoryFullName);
			onStage("starting");
			const created = await cloudTrpcClient.cloudWorkspace.create.mutate({
				organizationId,
				environmentId: environment.id,
				machineSize,
				name,
				branch: prepared.branch,
				move: {
					chatSessionId,
					...(sourceHostId ? { fromHostId: sourceHostId } : {}),
				},
			});
			seedMovedChat({
				collections,
				workspaceId: created.id,
				chatSessionId,
				harnessSessionId: prepared.harnessSessionId,
				agentId: "claude",
				title: prepared.title ?? name,
			});
			const listInput = { organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				rows ? [created, ...rows] : [created],
			);
			void utils.cloudWorkspace.list.invalidate();
			await navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.id },
			}).catch((error: unknown) => {
				console.warn("[chat-move] could not open the cloud workspace", error);
			});
		},
		[
			organizationId,
			t,
			trpcClient,
			workspaceId,
			utils,
			navigate,
			collections,
			sourceHostId,
			sourceRepository,
		],
	);
}
