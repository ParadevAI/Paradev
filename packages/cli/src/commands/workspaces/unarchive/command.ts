import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Restore an archived cloud workspace. Within 7 days of archiving it keeps its disk; after that it starts fresh from its environment",
	aliases: ["restore"],
	args: [positional("id").required().desc("Cloud workspace ID")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const { unarchived } = await ctx.api.cloudWorkspace.unarchive.mutate({
			id,
		});
		return {
			data: { id, unarchived },
			message: unarchived
				? `Restored cloud workspace ${id}`
				: `Cloud workspace ${id} is not archived`,
		};
	},
});
