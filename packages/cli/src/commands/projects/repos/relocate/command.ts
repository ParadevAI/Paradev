import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	hostPath,
	requireHostTarget,
	resolveHostTarget,
	resolveRepository,
} from "../../../../lib/host-target";

export default command({
	description:
		"Point a repository at the folder it now lives in on the host. Refused while workspaces use worktrees of that repository",
	args: [positional("repository").desc("Repository name or ID")],
	options: {
		host: string().desc("Target host machineId (required unless --local)"),
		local: boolean().desc("Target this machine (required unless --host)"),
		project: string().required().desc("Project ID"),
		path: string().required().desc("The folder the repository is in now"),
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
		const path = hostPath(target, options.path);
		const repository = await resolveRepository(
			target.client,
			options.project,
			ref,
		);
		const project = await target.client.project.relocateRepository.mutate({
			projectId: options.project,
			repositoryId: repository.id,
			path,
		});
		const stored =
			project.repositories.find((r) => r.id === repository.id)?.path ?? path;
		return {
			data: project,
			message: `${repository.name} is now at ${stored}`,
		};
	},
});
