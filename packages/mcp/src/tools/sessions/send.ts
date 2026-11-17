import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import {
	workspaceLocationInput,
	workspaceServiceCall,
} from "../../workspace-service-target";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "sessions_send",
		annotations: { destructiveHint: false },
		description:
			"Send a prompt to a running chat agent session in a workspace (a `sessionId` from `sessions_create`). Fails when the session is stopped.",
		inputSchema: {
			...workspaceLocationInput,
			workspaceId: z.string().uuid().describe("Workspace UUID of the session."),
			sessionId: z.string().min(1).describe("Chat session id."),
			prompt: z.string().min(1).describe("The message to send."),
		},
		handler: async (input, ctx) => {
			return workspaceServiceCall<unknown>(
				input,
				ctx,
				"sessions.send",
				"mutation",
				{
					workspaceId: input.workspaceId,
					sessionId: input.sessionId,
					prompt: input.prompt,
				},
			);
		},
	});
}
