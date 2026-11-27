import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import type { McpToolCallEmitter } from "./define-tool";
import { registerWorkspaceBoard } from "./resources/workspace-board";
import { registerTools } from "./tools/register";

export const MCP_SERVER_VERSION = packageJson.version;

export interface McpServerOptions {
	onToolCall?: McpToolCallEmitter;
}

export function createMcpServer(options?: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "superset", version: packageJson.version },
		{
			capabilities: { tools: {}, resources: {} },
			instructions:
				"Paradev orchestrates parallel AI coding agents in isolated Git worktrees on a user's registered machines. Use these tools to manage tasks, create workspaces (branch- or PR-scoped worktrees), launch coding-agent sessions, open terminals, and schedule recurring automations on behalf of the authenticated user. IDs are host-scoped: call hosts_list first, then projects_list/workspaces_list on that host. Tools annotated destructive can delete, overwrite or replace real user data, such as a whole trigger set or a prompt: confirm with the user before calling them. Tools annotated open-world reach outside Paradev's own data: they call Linear or other connected providers, publish pages, or run commands and agents that can change files on the user's machines.",
		},
	);
	registerTools(server, { onToolCall: options?.onToolCall });
	registerWorkspaceBoard(server);
	return server;
}
