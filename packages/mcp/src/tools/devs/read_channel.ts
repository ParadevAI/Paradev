import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "read_channel",
	callers: ["dev"],
	annotations: { readOnlyHint: true },
	description:
		"Read a channel or thread you can read for this turn: who said what, oldest first. `channel` is a name (#roster) or a reply_to target (channel:<id> or channel:<id>/thread:<id>). Read before answering when the message refers to earlier talk. For more, pass the returned `before`. Top-level messages give each thread's target and reply count.",
	inputSchema: {
		channel: z.string(),
		before: z.number().int().positive().optional(),
		limit: z.number().int().min(1).max(50).optional(),
	},
	handler: async (input, ctx) =>
		createMcpCaller(ctx).devTools.readChannel(input),
});
