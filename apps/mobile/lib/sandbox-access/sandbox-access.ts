import {
	createSandboxAccess,
	type SandboxGrant,
} from "@superset/shared/sandbox/access";
import { apiClient } from "@/lib/trpc/client";

export type SandboxAccess = SandboxGrant;

const access = createSandboxAccess<SandboxAccess>(async (workspaceId, wake) => {
	const granted = await apiClient.cloudWorkspace.access.mutate({
		id: workspaceId,
		wake,
	});
	return {
		url: granted.url,
		token: granted.token,
		expiresAt: new Date(granted.expiresAt).getTime(),
	};
});

export function getSandboxAccess(workspaceId: string): SandboxAccess | null {
	return access.get(workspaceId);
}

/** True when this host id is a cloud workspace whose sandbox has an address. */
export function isSandboxHost(machineId: string): boolean {
	return access.get(machineId) !== null;
}

export function sandboxToken(hostUrl: string): string | null {
	return access.tokenFor(hostUrl);
}

export const ensureSandboxAccess = access.ensure;
export const addressSandboxAccess = access.address;
export const wakeSandboxAccess = access.wake;
export const clearSandboxAccess = access.clear;
export const pruneSandboxAccess = access.prune;
