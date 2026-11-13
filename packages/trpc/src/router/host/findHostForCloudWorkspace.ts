import { db } from "@superset/db/client";
import { v2Hosts, v2UsersHosts } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import type { HostAsSeenByCreator } from "./cloud-workspace-access";

export async function findHostForCloudWorkspace({
	userId,
	organizationId,
	machineId,
}: {
	userId: string;
	organizationId: string;
	machineId: string;
}): Promise<HostAsSeenByCreator | null> {
	const [row] = await db
		.select({
			role: v2UsersHosts.role,
			allowCloudWorkspaces: v2Hosts.allowCloudWorkspaces,
		})
		.from(v2UsersHosts)
		.innerJoin(
			v2Hosts,
			and(
				eq(v2Hosts.organizationId, v2UsersHosts.organizationId),
				eq(v2Hosts.machineId, v2UsersHosts.hostId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, userId),
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.hostId, machineId),
			),
		)
		.limit(1);
	return row ?? null;
}
