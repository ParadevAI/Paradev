import type { PluginCatalogEntry } from "@superset/shared/plugins";
import { useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { localVersionKey } from "./utils/isUpdateAvailable";
import { onePerName } from "./utils/onePerName";
import { type CatalogRow, toCatalogPlugin } from "./utils/toCatalogPlugin";

export type PluginSkill = CatalogRow["skills"][number];

export interface CatalogPlugin extends Omit<PluginCatalogEntry, "auth"> {
	icon: string | null;
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
