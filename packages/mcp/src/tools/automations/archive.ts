import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_archive",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Archive an automation. Its schedules and event triggers stop immediately and it leaves automations_list; its runs remain. automations_unarchive restores it, paused. Caller must be the owner or an organization owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.archive({ id: input.id });
		},
	});

	defineTool(server, {
		name: "automations_unarchive",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Restore an archived automation. It comes back paused; call automations_resume to start it again.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.unarchive({ id: input.id });
		},
	});
}
