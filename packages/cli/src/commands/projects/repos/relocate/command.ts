import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";
import { resolveRepository } from "../utils/resolveRepository";

export default command({
	description: "Point a repository at the folder it now lives in on the host",
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
		const repository = await resolveRepository(
			target.client,
			options.project,
			ref,
		);
		const project = await target.client.project.relocateRepository.mutate({
			projectId: options.project,
			repositoryId: repository.id,
			path: options.path,
		});
		return {
			data: project,
			message: `${repository.name} is now at ${options.path}`,
		};
	},
});
