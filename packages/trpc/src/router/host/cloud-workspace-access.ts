import { parseHostRoutingKey } from "@superset/shared/host-routing";
import type { SandboxCaller } from "../../lib/sandbox/api-credential";

export interface HostAsSeenByCreator {
	role: string;
	allowCloudWorkspaces: boolean;
}

export type CloudWorkspaceAccess =
	| { allowed: true; userId: string; workspaceId: string }
	| { allowed: false; reason: "no_access" | "host_closed" };

/** Only the creator's own hosts: a member's switch is not theirs to flip. */
export async function decideCloudWorkspaceAccess(
	box: SandboxCaller | null,
	hostId: string,
	findHost: (where: {
		userId: string;
		organizationId: string;
		machineId: string;
	}) => Promise<HostAsSeenByCreator | null>,
): Promise<CloudWorkspaceAccess> {
	const parsed = parseHostRoutingKey(hostId);
	if (!box || !parsed || parsed.organizationId !== box.organizationId) {
		return { allowed: false, reason: "no_access" };
	}
	const host = await findHost({
		userId: box.userId,
		organizationId: parsed.organizationId,
		machineId: parsed.machineId,
	});
	if (host?.role !== "owner") return { allowed: false, reason: "no_access" };
	if (!host.allowCloudWorkspaces) {
		return { allowed: false, reason: "host_closed" };
	}
	return { allowed: true, userId: box.userId, workspaceId: box.workspaceId };
}
