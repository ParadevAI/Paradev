import { CLIError, number, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveEnvironment } from "../../../lib/environments";

export default command({
	description: "List an environment's builds, newest first",
	args: [positional("environment").required().desc("Environment ID")],
	options: {
		limit: number().desc("How many builds to show (default 20)"),
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
		const { builds } = await ctx.api.environment.builds.query({
			environmentId: id,
			limit: options.limit,
		});
		return {
			data: builds,
			message:
				builds
					.map((build) =>
						[
							build.id,
							build.status,
							build.trigger,
							build.startedAt.toISOString(),
							build.commitSha?.slice(0, 7) ?? "",
							build.active
								? "(active)"
								: build.restorable
									? "(restorable)"
									: "",
							build.status === "failed" && build.error
								? `\n    ${build.error.split("\n")[0]}`
								: "",
						]
							.filter(Boolean)
							.join("  "),
					)
					.join("\n") || "No builds yet",
		};
	},
});
