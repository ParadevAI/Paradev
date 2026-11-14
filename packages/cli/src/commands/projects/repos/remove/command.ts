import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	requireHostTarget,
	resolveHostTarget,
	resolveRepository,
} from "../../../../lib/host-target";

export default command({
	description:
		"Remove a repository from a project. Its files stay on disk; refused while a live workspace checks it out, or an archived two-repository workspace still has its folders on disk. Archived workspaces lose their checkout of it",
	args: [positional("repository").desc("Repository name or ID")],
	options: {
		host: string().desc("Target host machineId (required unless --local)"),
		local: boolean().desc("Target this machine (required unless --host)"),
		project: string().required().desc("Project ID"),
	},
	run: async ({ ctx, args, options }) => {
		const ref = args.repository as string | undefined;
		if (!ref) throw new CLIError("Pass the repository name or ID");
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
		const repository = await resolveRepository(
			target.client,
			options.project,
			ref,
		);
		const project = await target.client.project.removeRepository.mutate({
			projectId: options.project,
			repositoryId: repository.id,
		});
		return {
			data: project,
			message: `Removed ${repository.name} from ${project.name}`,
		};
	},
});
