import { CLIError, positional, string } from "@superset/cli-framework";
import { rawErrorMessage } from "@superset/i18n/errors";
import { command } from "../../../../lib/command";
import { cloudWorkspaceId } from "../../cloudWorkspaceId";
import { resolveGrantees } from "../resolveGrantees";

export default command({
	description:
		"Stop sharing a cloud workspace with members or teams. Inside a cloud workspace it defaults to that workspace",
	args: [
		positional("id").desc(
			"Cloud workspace ID (default: the cloud workspace this runs in)",
		),
	],
	options: {
		user: string().variadic().desc("Member email or user id. Repeatable"),
		team: string().variadic().desc("Team id. Repeatable"),
	},
	run: async ({ ctx, args, options }) => {
		const id = cloudWorkspaceId(args.id as string | undefined);
		const grantees = await resolveGrantees(
			ctx.api,
			options.user ?? [],
			options.team ?? [],
		);
		let removed = 0;
		for (const grantee of grantees) {
			try {
				const result = await ctx.api.cloudWorkspace.sharing.remove.mutate({
					id,
					grantee,
				});
				if (result.removed) removed++;
			} catch (error) {
				if (removed === 0) throw error;
				throw new CLIError(
					`Stopped sharing with ${removed}, then failed: ${rawErrorMessage(error)}`,
					"Run superset workspaces share list to see who still has access",
				);
			}
		}
		return {
			data: { id, removed },
			message: removed
				? `Stopped sharing cloud workspace ${id} with ${removed}`
				: `Cloud workspace ${id} was not shared with them`,
		};
	},
});
