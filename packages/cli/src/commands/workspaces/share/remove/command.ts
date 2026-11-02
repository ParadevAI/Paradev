import { positional, string } from "@superset/cli-framework";
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
			const result = await ctx.api.cloudWorkspace.sharing.remove.mutate({
				id,
				grantee,
			});
			if (result.removed) removed++;
		}
		return {
			data: { id, removed },
			message: `Stopped sharing cloud workspace ${id} with ${removed}`,
		};
	},
});
