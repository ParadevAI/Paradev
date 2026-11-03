import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "list_environments",
	callers: ["dev"],
	annotations: { readOnlyHint: true },
	description:
		"The environments (repositories) a task can run in, and which is your default.",
	handler: async (_input, ctx) =>
		createMcpCaller(ctx).devTools.listEnvironments(),
});
