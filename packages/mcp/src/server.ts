import { McpServer } from "@modelcontextprotocol/server";
import packageJson from "../package.json" with { type: "json" };
import type { McpCallerKind, McpContext } from "./auth";
import type { McpToolCallEmitter } from "./define-tool";
import { registerTools } from "./tools/register";

export const MCP_SERVER_VERSION = packageJson.version;

const INSTRUCTIONS: Record<McpCallerKind, string> = {
	person:
		"Paradev orchestrates parallel AI coding agents in isolated Git worktrees on a user's registered machines. Use these tools to manage tasks, create workspaces (branch- or PR-scoped worktrees), launch coding-agent sessions, open terminals, and schedule recurring automations on behalf of the authenticated user. IDs are host-scoped: call hosts_list first, then projects_list/workspaces_list on that host. Tools annotated destructive (deletes) remove real user data — confirm with the user before calling them.",
	dev: "Your tools as a Paradev Dev: answer people with reply, read channels, delegate work as tasks, keep notes, schedule routines, and publish pages. Each call acts for the person whose message started this turn.",
};

export interface McpServerOptions {
	kind: McpCallerKind;
	/** Null builds a server that lists its tools and refuses every call. */
	context: McpContext | null;
	onToolCall?: McpToolCallEmitter;
}

/** One server per request: its tools are the ones this caller may use. */
export function createMcpServer({
	kind,
	context,
	onToolCall,
}: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "superset", version: packageJson.version },
		{ capabilities: { tools: {} }, instructions: INSTRUCTIONS[kind] },
	);
	registerTools(server, { kind, context, onToolCall });
	return server;
}
