import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description:
		"Print a card's document as the reader sees it: integration cards resolved with your credentials, and the answers once the card is resolved",
	args: [positional("card").required().desc("Card id")],
	run: async ({ ctx, args }) => {
		const doc = await ctx.api.inbox.document.query({ id: args.card as string });
		return {
			data: doc,
			message: doc.blocks
				? `v${doc.version} · ${doc.blocks.length} blocks${doc.answers ? " · answered" : ""}`
				: "This card has no document",
		};
	},
});
