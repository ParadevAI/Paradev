import { number, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List the cards in your inbox",
	options: {
		view: string()
			.enum("open", "scheduled", "archive")
			.default("open")
			.desc("Which view: open (default), scheduled, or archive"),
		limit: number().default(50).desc("Max results"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["id", "title", "age", "sentBy", "document"],
			["ID", "TITLE", "AGE", "FROM", "DOCUMENT"],
		),
	run: async ({ ctx, options }) => {
		const { items } = await ctx.api.inbox.list.query({
			view: options.view as "open" | "scheduled" | "archive",
			limit: options.limit,
		});
		return items.map((card) => ({
			id: card.id,
			title: card.title,
			age: relative(card.createdAt),
			sentBy: card.sentBy?.name ?? null,
			document: card.hasDocument ? `v${card.documentVersion}` : null,
			page: card.page?.slug ?? null,
			workspaceId: card.workspaceId,
			agentSessionId: card.agentSessionId,
			resolvedAt: card.resolvedAt,
			showAt: card.showAt,
			waiting: card.waiting,
		}));
	},
});

function relative(date: Date): string {
	const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.round(s / 60)}m`;
	if (s < 86400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86400)}d`;
}
