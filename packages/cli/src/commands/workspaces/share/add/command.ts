import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { cloudWorkspaceId } from "../../cloudWorkspaceId";
import { resolveGrantees } from "../resolveGrantees";

export default command({
	description:
		"Share a cloud workspace with organization members or teams. Inside a cloud workspace it defaults to that workspace",
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
		const { added } = await ctx.api.cloudWorkspace.sharing.add.mutate({
			id,
			grantees,
		});
		return {
			data: { id, added },
			message: added.length
				? `Shared cloud workspace ${id} with ${added.length} more`
				: `No new shares on cloud workspace ${id}: each already has access (its owner always does)`,
		};
	},
});
