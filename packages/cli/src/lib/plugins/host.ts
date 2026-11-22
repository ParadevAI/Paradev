import { CLIError } from "@superset/cli-framework";

export {
	assertSafeSegment,
	findInstalled,
	type InstalledPluginEntry as InstalledPlugin,
	type KnownMarketplace,
	type MarketplaceSource,
	marketplaceManifest,
	marketplacesDir,
	pluginCachePath,
	pluginsRoot,
	readInstalledPlugins,
	readKnownMarketplaces,
	resolveAppHomeDir as supersetHome,
	skillsRoot,
	writeInstalledPlugins,
	writeKnownMarketplaces,
} from "@superset/agent-setup";
export {
	DEFAULT_MARKETPLACE,
	DEFAULT_MARKETPLACE_REF,
	DEFAULT_MARKETPLACE_REPO,
} from "@superset/shared/plugins";

export function parsePluginRef(ref: string): {
	name: string;
	marketplace?: string;
} {
	const at = ref.lastIndexOf("@");
	if (at <= 0) return { name: ref };
	return { name: ref.slice(0, at), marketplace: ref.slice(at + 1) };
}

export function resolvePluginRef(
	ref: string,
	marketplace?: string,
): { name: string; marketplace?: string } {
	const parsed = parsePluginRef(ref);
	if (parsed.marketplace && marketplace && parsed.marketplace !== marketplace) {
		throw new CLIError(
			`"${ref}" names marketplace "${parsed.marketplace}" but --marketplace says "${marketplace}". Pass one or the other.`,
		);
	}
	return { name: parsed.name, marketplace: marketplace ?? parsed.marketplace };
}
