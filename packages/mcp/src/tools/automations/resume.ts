import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "automations_resume",
	annotations: { destructiveHint: false, idempotentHint: true },
	description:
		"Resume a paused automation. Event triggers fire again, and the next scheduled fire is recomputed from the RRULE. Caller must be the owner.",
	inputSchema: {
		id: z.string().uuid().describe("Automation UUID."),
	},
	handler: async (input, ctx) => {
		const caller = createMcpCaller(ctx);
		return caller.automation.setEnabled({ id: input.id, enabled: true });
	},
});
