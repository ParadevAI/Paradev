export type McpServerScope = "user" | "project" | "local";

/**
 * - `available`: configured for the asking agent and enabled.
 * - `disabled`: configured for the asking agent but turned off in its config.
 * - `other-agent`: configured only for a different agent.
 * - `untrusted`: in a project config the agent skips until the project is
 *   trusted (Codex).
 */
export type McpServerState =
	| "available"
	| "disabled"
	| "other-agent"
	| "untrusted";

export interface McpServerEntry {
	name: string;
	agent: string;
	scope: McpServerScope;
	transport: string;
	url?: string;
	configPath: string;
	state: McpServerState;
}
