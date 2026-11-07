import { CLIError } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description:
		"Show which GitHub accounts the organization's GitHub App is installed on",
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const installations =
			await ctx.api.integration.github.listInstallations.query({
				organizationId,
			});
		if (installations.length === 0) {
			return {
				data: { installation: null, installations, repositories: 0 },
				message:
					"The GitHub App is not installed. Run: superset integrations github connect",
			};
		}
		const repositories =
			await ctx.api.integration.github.listRepositories.query({
				organizationId,
			});
		const accounts = installations
			.map(
				(installation) =>
					`${installation.accountLogin}${installation.suspended ? " (suspended)" : ""}`,
			)
			.join(", ");
		return {
			data: {
				installation: installations[0],
				installations,
				repositories: repositories.length,
			},
			message: `Installed on ${accounts}; ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}. List them with: superset environments repos`,
		};
	},
});
