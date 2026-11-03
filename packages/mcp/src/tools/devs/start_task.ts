import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "start_task",
	callers: ["dev"],
	description:
		"Delegate work that needs code or a machine. It becomes a Paradev task that people can see, worked on by a session on its own box. Pass a title for new work, or the taskId of an existing task (one from list_work, or one someone assigned you) to work on that instead. role `writer` changes code and opens a pull request; `reviewer` reviews the pull request of an existing task (pass its taskId). A task has one writer at a time. Give complete instructions: the session knows only the task and what you write. It reports back to you when it finishes.",
	inputSchema: {
		taskId: z.string().optional(),
		title: z.string().optional(),
		instructions: z.string(),
		role: z.enum(["writer", "reviewer"]).optional(),
		environmentId: z.string().optional(),
	},
	handler: async (input, ctx) => createMcpCaller(ctx).devTools.startTask(input),
});
