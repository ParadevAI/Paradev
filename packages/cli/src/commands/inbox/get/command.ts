import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Show one card, including its outcome once answered",
	args: [positional("card").required().desc("Card id")],
	run: async ({ ctx, args }) => {
		const card = await ctx.api.inbox.get.query({ id: args.card as string });
		const state = card.resolvedAt
			? `resolved ${card.resolvedAt.toISOString()}`
			: card.waiting
				? "open · an agent is waiting on it"
				: "open";
		return {
			data: card,
			message: [
				`${card.title}`,
				`${card.sentBy ? `from ${card.sentBy.name} · ` : ""}session ${card.agentSessionId} · ${state}`,
				`why: ${card.why}`,
				card.hasDocument ? `document: v${card.documentVersion}` : null,
				card.page ? `page: ${card.page.slug}` : null,
				card.outcome ? `outcome: ${JSON.stringify(card.outcome)}` : null,
			]
				.filter(Boolean)
				.join("\n"),
		};
	},
});
