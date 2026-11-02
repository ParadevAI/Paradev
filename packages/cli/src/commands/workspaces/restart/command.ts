import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Restart a cloud workspace: end every terminal and agent on it so they start again with the current agent sign-ins",
	args: [positional("id").required().desc("Cloud workspace ID")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const { restarted } = await ctx.api.cloudWorkspace.restart.mutate({ id });
		return {
			data: { id, restarted },
			message: `Restarted cloud workspace ${id}`,
		};
	},
});
