import { boolean, CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveEnvironment } from "../../../lib/environments";

const POLL_MS = 5_000;
const WAIT_MS = 10 * 60_000;

export default command({
	sandbox: false,
	description:
		"Build an environment's snapshot again from [install] on its base branch; new workspaces keep starting from the current one until it succeeds",
	args: [positional("environment").required().desc("Environment ID")],
	options: {
		wait: boolean().desc("Wait for the build to finish; exit 1 if it fails"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const { id } = await resolveEnvironment(
			ctx.api,
			organizationId,
			args.environment as string,
		);
		const build = await ctx.api.environment.rebuild.mutate({
			environmentId: id,
		});
		if (!options.wait) {
			return {
				data: build,
				message: `Build ${build.id} started. Follow it with: superset environments builds ${id}`,
			};
		}
		const deadline = Date.now() + WAIT_MS;
		let finished: typeof build | undefined;
		while (!finished && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, POLL_MS));
			const { builds } = await ctx.api.environment.builds.query({
				environmentId: id,
				limit: 5,
			});
			finished = builds.find(
				(candidate) =>
					candidate.id === build.id && candidate.status !== "running",
			);
		}
		if (!finished) {
			throw new CLIError(
				`Build ${build.id} is still running`,
				`Check it with: superset environments builds ${id}`,
			);
		}
		if (finished.status === "failed") {
			throw new CLIError(
				`Build ${build.id} failed`,
				finished.error ?? undefined,
			);
		}
		return {
			data: finished,
			message: `Build ${build.id} succeeded; new workspaces start from it`,
		};
	},
});
