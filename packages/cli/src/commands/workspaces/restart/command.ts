import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { cloudWorkspaceId } from "../cloudWorkspaceId";

export default command({
	description:
		"Restart a cloud workspace: end every terminal and agent on it so they start again with the current agent sign-ins. Inside a cloud workspace it defaults to that workspace",
	args: [
		positional("id").desc(
			"Cloud workspace ID (default: the cloud workspace this runs in)",
		),
	],
	run: async ({ ctx, args }) => {
		const id = cloudWorkspaceId(args.id as string | undefined);
		const { restarted } = await ctx.api.cloudWorkspace.restart.mutate({ id });
		return {
			data: { id, restarted },
			message: `Restarted cloud workspace ${id}`,
		};
	},
});
