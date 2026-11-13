import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";
import { repositorySource } from "../../create/utils/repositorySource";

export default command({
	description:
		"Add a repository to a project. Existing workspaces do not get a checkout of it",
	args: [
		positional("repo").desc("Local path on the host, or a git URL to clone"),
	],
	options: {
		host: string().desc("Target host machineId (required unless --local)"),
		local: boolean().desc("Target this machine (required unless --host)"),
		project: string().required().desc("Project ID"),
		parentDir: string().desc(
			"Directory a cloned URL lands in (required for a URL)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const value = args.repo as string | undefined;
		if (!value) throw new CLIError("Pass the repository path or URL");
		const source = repositorySource(value);
		if (source.kind === "clone" && !options.parentDir) {
			throw new CLIError("Cloning a URL needs --parent-dir");
		}
		if (source.kind === "local" && options.parentDir) {
			throw new CLIError(
				"--parent-dir applies to a cloned URL",
				"A local path is used where it is",
			);
		}
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const target = await resolveHostTarget({
			requestedHostId: requireHostTarget({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		const project = await target.client.project.addRepository.mutate({
			projectId: options.project,
			source,
			...(options.parentDir ? { parentDir: options.parentDir } : {}),
		});
		return {
			data: project,
			message: `Project ${project.name} now has: ${project.repositories.map((r) => r.name).join(", ")}`,
		};
	},
});
