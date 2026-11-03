import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "stop_task",
	callers: ["dev"],
	description:
		"Stop your sessions on a task that is no longer wanted. The task itself stays.",
	inputSchema: {
		taskId: z.string(),
	},
	handler: async (input, ctx) => createMcpCaller(ctx).devTools.stopTask(input),
});
