import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";

export interface SandboxAccess {
	url: string;
	desktopUrl: string;
	expiresAt: number;
	agentCredentialsChanged: boolean;
}

/** A ticketed address for a cloud workspace's host; `wake` starts a stopped box. */
export async function requestSandboxAccess(
	workspaceId: string,
	wake: boolean,
): Promise<SandboxAccess> {
	const granted = await apiTrpcClient.cloudWorkspace.access.mutate({
		id: workspaceId,
		wake,
	});
	setHostServiceSecret(granted.url, granted.token);
	setHostServiceSecret(granted.desktop.url, granted.desktop.token);
	return {
		url: granted.url,
		desktopUrl: granted.desktop.url,
		expiresAt: new Date(granted.expiresAt).getTime(),
		agentCredentialsChanged: granted.agentCredentialsChanged,
	};
}
