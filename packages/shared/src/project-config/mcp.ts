import type { ProjectConfig } from "./schema";

export interface McpPlugin {
	name: string;
	marketplace: string;
}

/** How `[mcp] allow` names a plugin: `name@marketplace`, as the CLI does. */
export function mcpPluginEntry(plugin: McpPlugin): string {
	return `${plugin.name}@${plugin.marketplace}`;
}

/** The plugins cloud agents may use: none with `enabled = false`, else `allow`; null allows every plugin. */
export function mcpAllowlist(config: ProjectConfig): string[] | null {
	if (config.mcp?.enabled === false) return [];
	return config.mcp?.allow ?? null;
}

export function mcpAllows(
	allowlist: readonly string[] | null,
	plugin: McpPlugin,
): boolean {
	return allowlist === null || allowlist.includes(mcpPluginEntry(plugin));
}
