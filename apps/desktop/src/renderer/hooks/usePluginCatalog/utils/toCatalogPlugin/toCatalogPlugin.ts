import type { PluginCategory } from "@superset/shared/plugins";
import type { RouterOutputs } from "@superset/trpc";
import type { CatalogPlugin } from "../../usePluginCatalog";
import { isUpdateAvailable } from "../isUpdateAvailable";

export type CatalogRow = RouterOutputs["plugins"]["list"][number];

export function toCatalogPlugin(
	plugin: CatalogRow,
	localVersions: ReadonlyMap<string, string> | undefined,
): CatalogPlugin {
	return {
		name: plugin.name,
		version: plugin.version,
		description: plugin.description,
		interface: {
			displayName: plugin.displayName,
			category: plugin.category as PluginCategory,
		},
		icon: plugin.icon ?? null,
		mcpServers: plugin.mcpUrl
			? { [plugin.name]: { type: "http" as const, url: plugin.mcpUrl } }
			: {},
		connector: plugin.connector,
		skills: plugin.skills.map((skill) => skill.name),
		marketplace: plugin.marketplace,
		installed: plugin.installed && plugin.enabled,
		managed: plugin.managed,
		latestVersion: plugin.latestVersion,
		updateAvailable: isUpdateAvailable(plugin, localVersions),
		accounts: plugin.accounts,
		connections: plugin.connections,
		pluginSkills: plugin.skills,
		homepage: plugin.homepage,
		author: plugin.author,
		license: plugin.license,
	};
}
