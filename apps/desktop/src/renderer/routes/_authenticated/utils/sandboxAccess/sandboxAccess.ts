import {
	createSandboxAccess,
	type SandboxGrant,
} from "@superset/shared/sandbox/access";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export interface SandboxAccess extends SandboxGrant {
	desktopUrl: string;
	desktopToken: string;
	agentCredentialsChanged: boolean;
}

export const sandboxAccess = createSandboxAccess<SandboxAccess>(
	async (workspaceId, wake) => {
		const granted = await apiTrpcClient.cloudWorkspace.access.mutate({
			id: workspaceId,
			wake,
		});
		return {
			url: granted.url,
			token: granted.token,
			desktopUrl: granted.desktop.url,
			desktopToken: granted.desktop.token,
			expiresAt: new Date(granted.expiresAt).getTime(),
			agentCredentialsChanged: granted.agentCredentialsChanged,
		};
	},
	{
		onGrant: async (grant) => {
			setHostServiceSecret(grant.url, grant.token);
			setHostServiceSecret(grant.desktopUrl, grant.desktopToken);
			await electronTrpcClient.portForwards.setHostToken
				.mutate({ hostUrl: grant.url, token: grant.token })
				.catch((err) => {
					console.warn("[sandbox] failed to hand gate ticket to main:", err);
				});
		},
	},
);
