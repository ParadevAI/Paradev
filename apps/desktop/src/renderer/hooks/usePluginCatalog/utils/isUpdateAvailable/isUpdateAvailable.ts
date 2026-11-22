import { isOrganizationMarketplace } from "@superset/shared/plugins";

export const localVersionKey = (marketplace: string, name: string) =>
	`${marketplace}/${name}`;

interface Row {
	name: string;
	marketplace: string;
	installed: boolean;
	enabled: boolean;
	version: string;
	latestVersion: string | null;
}

/**
 * The account reports an organization plugin at its latest version, so the
 * version on this machine comes from the local ledger; a plugin missing from
 * it has not reached this machine yet.
 */
export function isUpdateAvailable(
	plugin: Row,
	localVersions: ReadonlyMap<string, string> | undefined,
): boolean {
	if (!plugin.installed || !plugin.enabled || plugin.latestVersion === null) {
		return false;
	}
	if (!isOrganizationMarketplace(plugin.marketplace)) {
		return plugin.latestVersion !== plugin.version;
	}
	if (!localVersions) return false;
	return (
		localVersions.get(localVersionKey(plugin.marketplace, plugin.name)) !==
		plugin.latestVersion
	);
}
