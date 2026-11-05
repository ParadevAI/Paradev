import type {
	PluginCatalogEntry,
	PluginCategory,
} from "@superset/shared/plugins";
import type { RouterOutputs } from "@superset/trpc";
import { useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isUpdateAvailable, localVersionKey } from "./utils/isUpdateAvailable";
import { onePerName } from "./utils/onePerName";

type CatalogRow = RouterOutputs["plugins"]["list"][number];

export type PluginSkill = CatalogRow["skills"][number];

export interface CatalogPlugin extends Omit<PluginCatalogEntry, "auth"> {
	connector: string | null;
	marketplace: string;
	installed: boolean;
	managed: boolean;
	latestVersion: string | null;
	updateAvailable: boolean;
	accounts: string[];
	connections: CatalogRow["connections"];
	pluginSkills: PluginSkill[];
	homepage: string | null;
	author: string | null;
	license: string | null;
}

function toCatalogPlugin(
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

/** Changes arrive as realtime nudges; a window focus after this long also refetches, in case one was missed. */
const PLUGIN_CATALOG_STALE_MS = 5 * 60_000;

export const INCLUDE_ORGANIZATION = { includeOrganization: true };

export function usePluginCatalog() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;

	const query = cloudTrpc.plugins.list.useQuery(INCLUDE_ORGANIZATION, {
		enabled: Boolean(userId),
		staleTime: PLUGIN_CATALOG_STALE_MS,
		refetchOnWindowFocus: true,
	});

	const organizationVersions =
		electronTrpc.plugins.organizationVersions.useQuery();
	const localVersions = useMemo(
		() =>
			organizationVersions.data
				? new Map(
						organizationVersions.data.map((entry) => [
							localVersionKey(entry.marketplace, entry.name),
							entry.version,
						]),
					)
				: undefined,
		[organizationVersions.data],
	);

	const plugins = useMemo(
		() =>
			onePerName(
				(query.data ?? []).map((row) => toCatalogPlugin(row, localVersions)),
			),
		[query.data, localVersions],
	);

	return {
		plugins,
		isLoading: query.isLoading,
		error: query.error,
	};
}
