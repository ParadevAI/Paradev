import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List projects on a host (default: this machine)",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "repos", "id"],
			["NAME", "REPOSITORIES", "ID"],
		),
	options: {
		host: string().desc("List projects on a specific host machineId"),
		local: boolean().desc("List projects on this machine (the default)"),
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
		const projects = await target.client.project.list.query();

		return projects
			.map((project) => {
				const repositories = project.repositories ?? [];
				return {
					name: project.name,
					// The primary is marked with `*`.
					repos: repositories
						.map((r) => (r.isPrimary ? `${r.name}*` : r.name))
						.join(", "),
					id: project.id,
					repositories,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});
