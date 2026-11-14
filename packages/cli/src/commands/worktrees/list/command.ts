import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";
import { listProjectWorktrees } from "../projectWorktrees";

export default command({
	description:
		"List a project's git worktrees on a host (default: this machine). `workspaceId` is null for a worktree no workspace tracks yet",
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				...row,
				workspace: row.workspaceId ?? (row.hasWorkspace ? "yes" : "-"),
				main: row.isMain ? "yes" : "",
			})),
			["branch", "path", "main", "workspace"],
			["BRANCH", "PATH", "MAIN", "WORKSPACE"],
		),
	options: {
		project: string().required().desc("Project ID"),
		host: string().desc("Host the project is on (machineId)"),
		local: boolean().desc("The project is on this machine (the default)"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const hostId =
			resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}) ?? getHostId();
		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		return listProjectWorktrees(target.client, options.project);
	},
});
