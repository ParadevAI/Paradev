import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveEnvironment } from "../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Make an earlier build's snapshot the one new workspaces start from, without building",
	args: [
		positional("environment").required().desc("Environment ID"),
		positional("build")
			.required()
			.desc("Build ID, from: superset environments builds"),
	],
	run: async ({ ctx, args }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const { id } = await resolveEnvironment(
			ctx.api,
			organizationId,
			args.environment as string,
		);
		const build = await ctx.api.environment.restore.mutate({
			environmentId: id,
			buildId: args.build as string,
		});
		return {
			data: build,
			message: `Restored build ${build.id}; new workspaces start from it`,
		};
	},
});
