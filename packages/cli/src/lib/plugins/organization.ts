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
import { type InstallPluginResult, recordPlugin } from "./install";

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
	options: { provision?: boolean } = {},
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
	return await recordPlugin(
		{
			name: download.name,
			marketplace: download.marketplace,
			version: download.version,
			installPath,
			tools: manifestHasTools(parseManifest(files.get("plugin.json"))),
		},
		options,
	);
}

function dropFromLedger(
	shouldDrop: (entry: { name: string; marketplace: string }) => boolean,
): string[] {
	const ledger = readInstalledPlugins();
	const gone = ledger.filter(shouldDrop);
	if (!gone.length) return [];
	writeInstalledPlugins(ledger.filter((entry) => !gone.includes(entry)));
	for (const entry of gone) {
		if (entry.installPath) {
			fs.rmSync(entry.installPath, { recursive: true, force: true });
		}
	}
	return gone.map((entry) => entry.name);
}

/** Removes the plugins of every organization not in `keep` from this machine; the caller re-provisions agents. */
export function forgetOrganizationPlugins(
	keep: ReadonlySet<string> = new Set(),
): string[] {
	return dropFromLedger(
		(entry) =>
			isOrganizationMarketplace(entry.marketplace) &&
			!keep.has(entry.marketplace),
	);
}

/** In each organization besides the active one, drops the plugins the member may no longer use there. */
async function dropRevokedElsewhere(
	organizationIds: readonly string[],
	apiFor: (organizationId: string) => ApiClient,
): Promise<string[]> {
	const removed: string[] = [];
	for (const organizationId of organizationIds) {
		const marketplace = organizationMarketplace(organizationId);
		const wanted = new Set(
			(
				await apiFor(organizationId).plugins.list.query({
					includeOrganization: true,
				})
			)
				.filter(
					(plugin) => plugin.installed && plugin.marketplace === marketplace,
				)
				.map((plugin) => plugin.name),
		);
		removed.push(
			...dropFromLedger(
				(entry) => entry.marketplace === marketplace && !wanted.has(entry.name),
			),
		);
	}
	return removed;
}

/**
 * Brings this machine's organization plugins in line with the account: the
 * ones the member installed or the organization installs for them land or
 * update here, and ones the member lost access to, or whose organization they
 * left, are removed.
 */
export async function reconcileOrganizationPlugins(
	api: ApiClient,
	apiFor: (organizationId: string) => ApiClient = () => api,
): Promise<{ installed: string[]; removed: string[]; failed: string[] }> {
	const memberships = await api.user.myOrganizations.query();
	const organization = await api.user.myOrganization.query();
	const held = new Set(
		readInstalledPlugins().map((entry) => entry.marketplace),
	);
	const forgotten = [
		...forgetOrganizationPlugins(
			new Set(memberships.map((org) => organizationMarketplace(org.id))),
		),
		...(await dropRevokedElsewhere(
			memberships
				.map((org) => org.id)
				.filter(
					(id) =>
						id !== organization?.id && held.has(organizationMarketplace(id)),
				),
			apiFor,
		)),
	];
	if (!organization) return { installed: [], removed: forgotten, failed: [] };
	const marketplace = organizationMarketplace(organization.id);

	const wanted = (
		await api.plugins.list.query({ includeOrganization: true })
	).filter((plugin) => plugin.installed && plugin.marketplace === marketplace);
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
			await installOrganizationPlugin(api, plugin.name, { provision: false });
			result.installed.push(plugin.name);
		} catch {
			result.failed.push(plugin.name);
		}
	}
	result.removed.push(
		...dropFromLedger(
			(entry) =>
				entry.marketplace === marketplace &&
				!wanted.some((plugin) => plugin.name === entry.name),
		),
	);
	return result;
}
