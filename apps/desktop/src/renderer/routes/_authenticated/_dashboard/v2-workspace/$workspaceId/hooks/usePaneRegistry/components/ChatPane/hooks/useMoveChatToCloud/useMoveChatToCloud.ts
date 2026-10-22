import { useLingui } from "@lingui/react/macro";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";

export function useMoveChatToCloud(workspaceId: string) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { trpcClient } = useWorkspaceClient();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();

	return useCallback(
		async ({
			harnessSessionId,
			name,
		}: {
			harnessSessionId: string;
			name: string;
		}) => {
			if (!organizationId) throw new Error(t`No active organization`);
			const prepared = await trpcClient.teleport.prepareClaudeSession.mutate({
				workspaceId,
				harnessSessionId,
			});
			const repositories =
				await cloudTrpcClient.integration.github.listRepositories.query({
					organizationId,
				});
			const repositoryName = prepared.repositoryFullName;
			const repository = repositories.find(
				(row) => row.fullName.toLowerCase() === repositoryName.toLowerCase(),
			);
			if (!repository) {
				throw new Error(
					t`The Superset GitHub App cannot see ${repositoryName}`,
				);
			}
			const created = await cloudTrpcClient.cloudWorkspace.create.mutate({
				organizationId,
				repositoryId: repository.id,
				name,
				branch: prepared.branch,
				agent: "claude",
				resume: {
					harnessSessionId,
					transcriptFileId: prepared.transcriptFileId,
				},
			});
			const listInput = { organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				rows ? [created, ...rows] : [created],
			);
			void utils.cloudWorkspace.list.invalidate();
			void utils.environment.list.invalidate();
			await navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.id },
			});
		},
		[organizationId, t, trpcClient, workspaceId, utils, navigate],
	);
}
