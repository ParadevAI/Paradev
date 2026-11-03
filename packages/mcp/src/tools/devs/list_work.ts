import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "list_work",
	callers: ["dev"],
	annotations: { readOnlyHint: true },
	description:
		"The Paradev tasks you work on, newest first: taskId, slug (e.g. SUPER-12), title, status, pull request, a short summary of the latest report, and your sessions on each (writer or reviewer; queued, running, done, failed or stopped).",
	handler: async (_input, ctx) => createMcpCaller(ctx).devTools.listWork(),
});
