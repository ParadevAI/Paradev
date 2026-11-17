import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_delete",
		annotations: { destructiveHint: true },
		description:
			"Permanently delete an archived automation and its run history. This can't be undone. Archive it first with automations_archive. Caller must be the owner or an organization owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.deleteArchived({ id: input.id });
		},
	});
}
