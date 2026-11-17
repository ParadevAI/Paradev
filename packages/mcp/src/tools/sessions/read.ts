import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import {
	workspaceLocationInput,
	workspaceServiceCall,
} from "../../workspace-service-target";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "sessions_read",
		annotations: { readOnlyHint: true },
		description:
			"Read the latest items of a chat agent session in a workspace: what was asked and what the agent said and did. Use it to see how a session started with `sessions_create` is going.",
		inputSchema: {
			...workspaceLocationInput,
			workspaceId: z.string().uuid().describe("Workspace UUID of the session."),
			sessionId: z.string().min(1).describe("Chat session id."),
			limit: z
				.number()
				.int()
				.positive()
				.max(200)
				.optional()
				.describe("How many of the latest items to return (default 50)."),
		},
		handler: async (input, ctx) => {
			return workspaceServiceCall<unknown>(
				input,
				ctx,
				"sessions.read",
				"query",
				{
					workspaceId: input.workspaceId,
					sessionId: input.sessionId,
					limit: input.limit ?? 50,
				},
			);
		},
	});
}
