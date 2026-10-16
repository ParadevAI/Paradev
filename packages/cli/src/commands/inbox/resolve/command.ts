import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Resolve a card yourself, so nobody is asked about something that no longer needs them",
	args: [positional("card").required().desc("Card id")],
	options: {
		note: string().desc("Why it no longer needs an answer"),
	},
	run: async ({ ctx, args, options }) => {
		const card = await ctx.api.inbox.resolve.mutate({
			id: args.card as string,
			outcome: {
				kind: "resolved",
				...(options.note ? { note: options.note } : {}),
			},
		});
		return { data: card, message: `Resolved ${card.id}: ${card.title}` };
	},
});
