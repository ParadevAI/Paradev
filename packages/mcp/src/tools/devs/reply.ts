import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "reply",
	callers: ["dev"],
	description:
		"Post a message as yourself. `target` is the reply_to of the message you are answering (channel:<id> or channel:<id>/thread:<id>). Use it for every answer; people see nothing else you write.",
	inputSchema: {
		target: z.string(),
		body: z.string(),
	},
	handler: async (input, ctx) => createMcpCaller(ctx).devTools.reply(input),
});
