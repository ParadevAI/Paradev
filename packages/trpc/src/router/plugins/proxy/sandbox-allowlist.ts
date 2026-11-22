import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { mcpAllows } from "@superset/shared/project-config";
import { eq } from "drizzle-orm";
import { environmentMcpAllowlist } from "../../../lib/sandbox/plugins";

/** Whether a cloud workspace's environment config lets its box call this plugin. */
export async function sandboxAllowsPlugin(args: {
	workspaceId: string;
	marketplace: string;
	plugin: string;
}): Promise<boolean> {
	const [row] = await db
		.select({ config: environments.config })
		.from(cloudWorkspaces)
		.innerJoin(environments, eq(environments.id, cloudWorkspaces.environmentId))
		.where(eq(cloudWorkspaces.id, args.workspaceId))
		.limit(1);
	if (!row) return false;
	return mcpAllows(environmentMcpAllowlist(row.config), {
		marketplace: args.marketplace,
		name: args.plugin,
	});
}
