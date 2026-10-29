import fs from "node:fs";
import { writePluginTree } from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";
import {
	isOrganizationMarketplace,
	manifestHasTools,
	organizationMarketplace,
} from "@superset/shared/plugins";
import {
	pluginBundleHash,
	unpackPluginBundle,
} from "@superset/shared/plugins/bundle";
import type { ApiClient } from "../api-client";
import { readInstalledPlugins, writeInstalledPlugins } from "./host";
import {
	type InstallPluginResult,
	recordPlugin,
	removePlugin,
} from "./install";

function parseManifest(raw: Uint8Array | undefined): unknown {
	try {
		return raw ? JSON.parse(Buffer.from(raw).toString("utf8")) : null;
	} catch {
		return null;
	}
}

export async function installOrganizationPlugin(
	api: ApiClient,
	name: string,
): Promise<InstallPluginResult> {
	const download = await api.plugins.organization.bundle.query({ name });
	const bundle = Buffer.from(download.bundle, "base64");
	if (pluginBundleHash(bundle) !== download.contentHash) {
		throw new CLIError(
			`The download of "${name}" does not match what your organization synced. Try again.`,
		);
	}
	const { files, executable } = unpackPluginBundle(bundle);
	const installPath = writePluginTree(
		download.marketplace,
		download.name,
		download.version,
		files,
		executable,
	);
	return await recordPlugin({
		name: download.name,
		marketplace: download.marketplace,
		version: download.version,
		installPath,
		tools: manifestHasTools(parseManifest(files.get("plugin.json"))),
	});
}

/** Removes the plugins of every organization not in `keep` from this machine; the caller re-provisions agents. */
export function forgetOrganizationPlugins(
	keep: ReadonlySet<string> = new Set(),
): string[] {
	const ledger = readInstalledPlugins();
	const gone = ledger.filter(
		(entry) =>
			isOrganizationMarketplace(entry.marketplace) &&
			!keep.has(entry.marketplace),
	);
	if (!gone.length) return [];
	writeInstalledPlugins(ledger.filter((entry) => !gone.includes(entry)));
	for (const entry of gone) {
		if (entry.installPath) {
			fs.rmSync(entry.installPath, { recursive: true, force: true });
		}
	}
	return gone.map((entry) => entry.name);
}

/**
 * Brings this machine's organization plugins in line with the account: the
 * ones the member installed or the organization installs for them land or
 * update here, and ones the member lost access to, or whose organization they
 * left, are removed.
 */
export async function reconcileOrganizationPlugins(
	api: ApiClient,
): Promise<{ installed: string[]; removed: string[]; failed: string[] }> {
	const memberships = await api.user.myOrganizations.query();
	const forgotten = forgetOrganizationPlugins(
		new Set(memberships.map((org) => organizationMarketplace(org.id))),
	);
	const organization = await api.user.myOrganization.query();
	if (!organization) return { installed: [], removed: forgotten, failed: [] };
	const marketplace = organizationMarketplace(organization.id);

	const wanted = (await api.plugins.list.query()).filter(
		(plugin) => plugin.installed && plugin.marketplace === marketplace,
	);
	const local = readInstalledPlugins().filter(
		(plugin) => plugin.marketplace === marketplace,
	);

	const result = {
		installed: [] as string[],
		removed: [...forgotten],
		failed: [] as string[],
	};
	for (const plugin of wanted) {
		const here = local.find((entry) => entry.name === plugin.name);
		if (here?.installPath && here.version === plugin.latestVersion) continue;
		try {
			await installOrganizationPlugin(api, plugin.name);
			result.installed.push(plugin.name);
		} catch {
			result.failed.push(plugin.name);
		}
	}
	for (const entry of local) {
		if (wanted.some((plugin) => plugin.name === entry.name)) continue;
		await removePlugin(entry.name, marketplace);
		result.removed.push(entry.name);
	}
	return result;
}
