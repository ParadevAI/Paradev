import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "channel_tasks",
	callers: ["dev"],
	annotations: { readOnlyHint: true },
	description:
		"What a channel's Tasks tab shows: the tasks of its Paradev project (slug, title, status, assignee, pull request), or the issues of its Linear project (identifier, title, status, assignee, url). `channel` is a name or a reply_to target.",
	inputSchema: {
		channel: z.string(),
	},
	handler: async (input, ctx) =>
		createMcpCaller(ctx).devTools.channelTasks(input),
});
