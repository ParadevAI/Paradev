import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "message_task",
	callers: ["dev"],
	description:
		"Send more instructions to the task's latest writer session (or reviewer, with role), such as review feedback. It reports back again when done.",
	inputSchema: {
		taskId: z.string(),
		text: z.string(),
		role: z.enum(["writer", "reviewer"]).optional(),
	},
	handler: async (input, ctx) =>
		createMcpCaller(ctx).devTools.messageTask(input),
});
