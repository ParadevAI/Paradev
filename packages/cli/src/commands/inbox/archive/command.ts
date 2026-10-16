import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Archive a card without acting on it. The sending agent is told, so silence is never the answer",
	args: [positional("card").required().desc("Card id")],
	run: async ({ ctx, args }) => {
		const card = await ctx.api.inbox.resolve.mutate({
			id: args.card as string,
			outcome: { kind: "archived" },
		});
		return { data: card, message: `Archived ${card.id}: ${card.title}` };
	},
});
