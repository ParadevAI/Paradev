import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "recall",
	callers: ["dev"],
	annotations: { readOnlyHint: true },
	description: "Your notes, newest first; `query` filters by text.",
	inputSchema: {
		query: z.string().optional(),
	},
	handler: async (input, ctx) => createMcpCaller(ctx).devTools.recall(input),
});
