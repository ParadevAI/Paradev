import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "read_task",
	callers: ["dev"],
	annotations: { readOnlyHint: true },
	description:
		"One task in full: its description, pull request, and each of your sessions on it with what it last reported.",
	inputSchema: {
		taskId: z.string(),
	},
	handler: async (input, ctx) => createMcpCaller(ctx).devTools.readTask(input),
});
