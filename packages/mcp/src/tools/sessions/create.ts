import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import {
	workspaceLocationInput,
	workspaceServiceCall,
} from "../../workspace-service-target";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "sessions_create",
		annotations: { destructiveHint: false },
		description:
			"Create a chat agent session inside an existing workspace on its host: a conversation with the named chat-capable agent (e.g. `claude`, `codex`) that people can read and reply to in the app, as opposed to `agents_create`, which runs an agent in a terminal. Omit hostId for a cloud workspace; for a host workspace pass its hostId. Returns the chat `sessionId`; follow up with `sessions_send` and read it with `sessions_read`.",
		inputSchema: {
			...workspaceLocationInput,
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID to start the chat session in."),
			agent: z
				.string()
				.min(1)
				.describe(
					"Chat-capable agent preset id (e.g. `claude`, `codex`) or HostAgentConfig instance UUID.",
				),
			prompt: z
				.string()
				.min(1)
				.optional()
				.describe("Initial prompt sent to the chat session."),
			model: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Model for this launch. Supported values depend on the agent; omit to use its default.",
				),
		},
		handler: async (input, ctx) => {
			return workspaceServiceCall<{ sessionId: string; label: string }>(
				input,
				ctx,
				"sessions.create",
				"mutation",
				{
					workspaceId: input.workspaceId,
					agent: input.agent,
					prompt: input.prompt,
					model: input.model,
				},
			);
		},
	});
}
