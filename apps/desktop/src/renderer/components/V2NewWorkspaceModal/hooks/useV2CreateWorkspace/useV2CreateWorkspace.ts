import { useCallback, useState } from "react";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import {
	resolveCreateWorkspaceHostUrl,
	type WorkspaceHostTarget,
} from "renderer/lib/v2-workspace-host";
import { useWorkspaceHostOptions } from "../../components/DevicePicker/hooks/useWorkspaceHostOptions";

interface V2CreateWorkspaceInput {
	projectId: string;
	name: string;
	branch: string;
	hostTarget: WorkspaceHostTarget;
}

export function useV2CreateWorkspace() {
	const [isPending, setIsPending] = useState(false);
	const { localHostService } = useWorkspaceHostOptions();

	const createWorkspace = useCallback(
		async (input: V2CreateWorkspaceInput) => {
			setIsPending(true);
			try {
				const hostUrl = resolveCreateWorkspaceHostUrl(
					input.hostTarget,
					localHostService?.url ?? null,
				);
				if (!hostUrl) {
					throw new Error("Host service not available");
				}

				const client: HostServiceClient =
					input.hostTarget.kind === "local" && localHostService
						? localHostService.client
						: getHostServiceClientByUrl(hostUrl);

				return await client.workspace.create.mutate({
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
				});
			} finally {
				setIsPending(false);
			}
		},
		[localHostService],
	);

	return { createWorkspace, isPending };
}
