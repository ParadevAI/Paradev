import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { electronTrpcClient } from "renderer/lib/trpc-client";

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
	await electronTrpcClient.portForwards.setHostToken
		.mutate({ hostUrl: granted.url, token: granted.token })
		.catch((err) => {
			console.warn("[sandbox] failed to hand gate ticket to main:", err);
		});
	return {
		url: granted.url,
		desktopUrl: granted.desktop.url,
		expiresAt: new Date(granted.expiresAt).getTime(),
		agentCredentialsChanged: granted.agentCredentialsChanged,
	};
}
