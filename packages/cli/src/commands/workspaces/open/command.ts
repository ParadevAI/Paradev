import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import { openUrl, workspaceLinks } from "../../../lib/open-url";

export default command({
	description: "Open a workspace in the Paradev desktop app",
	args: [positional("id").required().desc("Workspace ID")],
	options: {
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		print: boolean().desc(
			"Print the deep link URL instead of opening the desktop app",
		),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		// Opening only needs the id and name: a cloud workspace's come from the
		// API, so the desktop, not this command, wakes its sandbox.
		const hostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		const workspace = hostId
			? (
					await resolveWorkspaceTarget(
						{
							organizationId,
							userJwt: ctx.bearer,
							api: ctx.api,
							host: hostId,
						},
						id,
					)
				).workspace
			: await cloudWorkspaceRow(ctx.api, organizationId, id);

		const { url, webUrl } = workspaceLinks(workspace.id);

		if (!options.print) {
			try {
				await openUrl(url);
			} catch (err) {
				throw new CLIError(
					"Failed to open desktop app",
					err instanceof Error ? err.message : String(err),
				);
			}
		}

		return {
			data: { id: workspace.id, name: workspace.name, url, webUrl },
			message: options.print
				? url
				: `Opening "${workspace.name}" in Paradev desktop`,
		};
	},
});

async function cloudWorkspaceRow(
	api: ApiClient,
	organizationId: string,
	id: string,
): Promise<{ id: string; name: string }> {
	const row = (await api.cloudWorkspace.list.query({ organizationId })).find(
		(candidate) => candidate.id === id,
	);
	if (!row) {
		throw new CLIError(
			`No cloud workspace ${id} in this organization`,
			"Pass --local for a workspace on this machine, or --host <id> for another host",
		);
	}
	return row;
}
