import { CLIError } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description: "Show where the organization's GitHub App is installed",
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
				data: { installations: [], repositories: 0 },
				message:
					"The GitHub App is not installed. Run: superset integrations github connect",
			};
		}
		const repositories =
			await ctx.api.integration.github.listRepositories.query({
				organizationId,
			});
		const accounts = installations
			.map((row) => `${row.accountLogin}${row.suspended ? " (suspended)" : ""}`)
			.join(", ");
		return {
			data: { installations, repositories: repositories.length },
			message: `Installed on ${accounts}; ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}. List them with: superset environments repos`,
		};
	},
});
