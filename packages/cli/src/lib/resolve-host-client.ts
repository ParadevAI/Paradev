import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import type { CliContext } from "./command";
import {
	type HostServiceClient,
	resolveCloudWorkspaceTarget,
	resolveHostTarget,
} from "./host-target";

/**
 * A client for `--host`, or for this machine's host when it is not given.
 * `--host cloud` takes the workspace's own host, since each cloud workspace
 * runs one.
 */
export async function resolveHostClient(
	ctx: CliContext,
	options: { host?: string | null; workspace?: string | null },
): Promise<HostServiceClient> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	if (options.host?.toLowerCase() === CLOUD_HOST_ID && options.workspace) {
		const { target } = await resolveCloudWorkspaceTarget({
			api: ctx.api,
			organizationId,
			workspaceId: options.workspace,
		});
		return target.client;
	}
	const target = await resolveHostTarget({
		requestedHostId: options.host ?? getHostId(),
		organizationId,
		userJwt: ctx.bearer,
		api: ctx.api,
	});
	return target.client;
}
