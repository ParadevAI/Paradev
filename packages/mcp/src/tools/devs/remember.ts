import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "remember",
	callers: ["dev"],
	description:
		"Keep a note for later, across all your conversations: a preference, a decision, a fact about the team.",
	inputSchema: {
		content: z.string(),
	},
	handler: async (input, ctx) => createMcpCaller(ctx).devTools.remember(input),
});
