import { readFileSync } from "node:fs";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveEnvironment } from "../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Rename an environment, change who can use it, or set the config.toml its builds and cloud workspaces run",
	args: [positional("environment").required().desc("Environment ID")],
	options: {
		name: string().desc("New name"),
		scope: string().enum("organization", "personal").desc("Who can use it"),
		config: string().desc(
			"Path to a config.toml to store as the environment's config; without one, the cloud reads the primary repository's .paradev/config.toml",
		),
		clearConfig: boolean().desc("Remove the environment's config"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		if (options.config && options.clearConfig) {
			throw new CLIError("Pass --config or --clear-config, not both");
		}
		if (
			!options.name &&
			!options.scope &&
			!options.config &&
			!options.clearConfig
		) {
			throw new CLIError(
				"Nothing to change",
				"Pass --name, --scope, --config or --clear-config",
			);
		}
		const environment = await resolveEnvironment(
			ctx.api,
			organizationId,
			args.environment as string,
		);
		const config = options.clearConfig
			? null
			: options.config
				? readFileSync(options.config, "utf-8")
				: undefined;
		const updated = await ctx.api.environment.update.mutate({
			id: environment.id,
			name: options.name,
			scope: options.scope,
			config,
		});
		return {
			data: updated,
			message:
				config === undefined
					? `Updated ${updated?.name ?? environment.name}`
					: `Updated ${updated?.name ?? environment.name}; run superset environments rebuild ${environment.id} to build it with this config`,
		};
	},
});
