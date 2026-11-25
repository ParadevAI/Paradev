import { number, positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

const CONTROL_CHARS = /\p{Cc}/gu;

/** Control characters shown as escapes, so stored chat text cannot drive the terminal. */
function printable(value: unknown): string {
	return String(value ?? "").replace(
		CONTROL_CHARS,
		(char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
	);
}

export default command({
	description:
		"Search your chat sessions stored in the cloud (chats on cloud workspaces, and chats moved there)",
	args: [positional("query").required().desc("Words or code names to find")],
	options: {
		limit: number()
			.int()
			.min(1)
			.max(50)
			.desc("Maximum number of conversations to return (1-50)"),
	},
	display: (data) =>
		table(
			((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
				...row,
				title: printable(row.title),
				snippet: printable(row.snippet),
			})),
			["sessionId", "title", "workspaceId", "snippet", "lastActiveAt"],
			["SESSION", "TITLE", "WORKSPACE", "MATCH", "UPDATED"],
		),
	run: async ({ ctx, args, options }) => {
		const results = await ctx.api.chatHistory.search.query({
			query: args.query as string,
			limit: options.limit,
		});
		const rows = results.map((row) => ({
			sessionId: row.sessionId,
			title: row.title ?? "",
			workspaceId: row.workspaceId ?? "",
			harness: row.harness ?? "",
			snippet: row.snippet.replace(/\s+/g, " ").trim(),
			score: row.score,
			lastActiveAt: row.lastActiveAt.toISOString(),
		}));
		return {
			data: rows,
			message: `${rows.length} conversation(s) match "${args.query as string}"`,
		};
	},
});
