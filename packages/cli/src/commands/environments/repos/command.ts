import { CLIError, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	sandbox: false,
	description:
		"List the repositories you can build an environment on: public ones the organization's GitHub App can see, and private ones your own GitHub account also reaches; these are what --repo accepts",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["fullName", "defaultBranch", "visibility"],
			["REPOSITORY", "DEFAULT BRANCH", "VISIBILITY"],
			[48, 16, 10],
		),
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const { repositories, connected, connectable } =
			await ctx.api.integration.github.listAccessibleRepositories.query({
				organizationId,
			});
		if (repositories.length === 0) {
			throw new CLIError(
				"No repositories you can use in this organization",
				connectable && !connected
					? "Private repositories appear once you connect your GitHub account: superset connections github connect. To install the App: superset integrations github connect"
					: "Run: superset integrations github connect",
			);
		}
		return repositories
			.map((repo) => ({
				fullName: repo.fullName,
				defaultBranch: repo.defaultBranch,
				visibility: repo.isPrivate ? "private" : "public",
			}))
			.sort((a, b) => a.fullName.localeCompare(b.fullName));
	},
});
