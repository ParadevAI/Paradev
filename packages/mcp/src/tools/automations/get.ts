import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "automations_get",
	annotations: { readOnlyHint: true },
	description:
		"Get a single automation's metadata. Returns name, schedule, agent, host — the prompt body is omitted (call automations_get_prompt to fetch it). For run history, call automations_logs. Caller must be the automation's owner.",
	inputSchema: {
		id: z.string().uuid().describe("Automation UUID."),
	},
	handler: async (input, ctx) => {
		const caller = createMcpCaller(ctx);
		return await caller.automation.get({ id: input.id });
	},
});
