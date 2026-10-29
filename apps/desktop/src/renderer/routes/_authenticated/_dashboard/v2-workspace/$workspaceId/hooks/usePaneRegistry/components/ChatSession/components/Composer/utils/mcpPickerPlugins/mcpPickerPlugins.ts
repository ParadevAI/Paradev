import { desiredPluginMcpServers } from "@superset/shared/plugins";
import type { CatalogPlugin } from "renderer/hooks/usePluginCatalog";

export interface McpPickerPlugin {
	name: string;
	displayName: string;
	servers: readonly string[];
	urls: readonly string[];
	connector: string | null;
	connected: boolean;
	installed: boolean;
}

export function mcpPickerPlugins(
	catalog: readonly CatalogPlugin[],
	installedHere: ReadonlySet<string> = new Set(),
): McpPickerPlugin[] {
	return catalog.flatMap((plugin) => {
		const desired = desiredPluginMcpServers([
			{ name: plugin.name, marketplace: plugin.marketplace },
		]);
		const servers = Object.keys(desired);
		if (!servers.length) return [];
		return [
			{
				name: plugin.name,
				displayName: plugin.interface.displayName,
				servers,
				urls: Object.values(desired).flatMap((config) =>
					"url" in config ? [config.url] : [],
				),
				connector: plugin.connector,
				connected: plugin.connections.length > 0,
				installed: plugin.installed || installedHere.has(plugin.name),
			},
		];
	});
}
