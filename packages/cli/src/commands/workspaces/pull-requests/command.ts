import { boolean, CLIError, positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"List the pull requests of cloud workspaces: those linked to each one, and those on its branch. Inside a cloud workspace it defaults to that workspace; pass --all for every cloud workspace you can see. Outside one it lists them all",
	aliases: ["prs"],
	args: [
		positional("id").desc(
			"Cloud workspace ID (default: the cloud workspace this runs in)",
		),
	],
	options: {
		all: boolean().desc("Every cloud workspace you can see"),
		archived: boolean().desc(
			"Archived cloud workspaces instead; implies --all unless an id is given",
		),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["cloudWorkspaceId", "repoFullName", "number", "state", "title", "url"],
			["WORKSPACE", "REPO", "PR", "STATE", "TITLE", "URL"],
		),
	run: async ({ ctx, args, options }) => {
		const id =
			(args.id as string | undefined) ??
			(options.all || options.archived
				? undefined
				: process.env.SUPERSET_SANDBOX_WORKSPACE_ID);
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const rows = await ctx.api.cloudWorkspace.pullRequests.query({
			organizationId,
			archived: options.archived ?? false,
		});
		return id ? rows.filter((row) => row.cloudWorkspaceId === id) : rows;
	},
});
