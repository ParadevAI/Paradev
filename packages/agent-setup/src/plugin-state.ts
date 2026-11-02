import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type InstalledPluginEntry,
	installedPluginsFilePath,
} from "./installed-plugins";
import { resolveAppHomeDir } from "./paths";
import { PluginError } from "./plugin-error";
import { MARKETPLACE_FILE, type Marketplace } from "./plugin-marketplace";
import { writeFileIfChanged } from "./write-file-if-changed";

export interface MarketplaceSource {
	kind: "github" | "path";
	repo?: string;
	ref?: string;
	path?: string;
}

export interface KnownMarketplace {
	source: MarketplaceSource;
	installLocation: string;
	lastUpdated: string;
}

export function pluginsRoot(): string {
	return path.join(resolveAppHomeDir(), "plugins");
}

export function skillsRoot(): string {
	return path.join(os.homedir(), ".agents", "skills");
}

export function marketplacesDir(): string {
	return path.join(pluginsRoot(), "marketplaces");
}

function knownFile(): string {
	return path.join(pluginsRoot(), "known_marketplaces.json");
}

/**
 * A missing file is an empty ledger; an unreadable one is not. Returning the
 * fallback for a parse failure would let the next write replace a whole
 * machine's install list with the one entry that happened to be in hand.
 */
function readJsonFile<T>(file: string, fallback: T): T {
	if (!fs.existsSync(file)) return fallback;
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as T;
	} catch (error) {
		throw new PluginError(
			`${file} is not readable JSON, so it cannot be safely rewritten: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function readKnownMarketplaces(): Record<string, KnownMarketplace> {
	return readJsonFile<Record<string, KnownMarketplace>>(knownFile(), {});
}

export function writeKnownMarketplaces(
	value: Record<string, KnownMarketplace>,
): void {
	const file = knownFile();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	writeFileIfChanged(file, `${JSON.stringify(value, null, "\t")}\n`, 0o644);
}

export function readInstalledPlugins(): InstalledPluginEntry[] {
	const raw = readJsonFile<{
		version: number;
		plugins: InstalledPluginEntry[];
	}>(installedPluginsFilePath(), { version: 1, plugins: [] });
	return raw.plugins ?? [];
}

export function marketplaceManifest(name: string): Marketplace {
	const known = readKnownMarketplaces()[name];
	if (!known) {
		throw new PluginError(`Marketplace "${name}" is not installed.`, {
			code: "marketplace-not-installed",
		});
	}
	const file = path.join(known.installLocation, MARKETPLACE_FILE);
	if (!fs.existsSync(file)) {
		throw new PluginError(
			`Marketplace "${name}" has no ${MARKETPLACE_FILE} at ${known.installLocation}.`,
		);
	}
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as Marketplace;
	} catch (error) {
		throw new PluginError(
			`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function findInstalled(
	plugins: InstalledPluginEntry[],
	name: string,
	marketplace?: string,
): InstalledPluginEntry | undefined {
	const matches = plugins.filter(
		(p) => p.name === name && (!marketplace || p.marketplace === marketplace),
	);
	if (matches.length > 1) {
		throw new PluginError(
			`"${name}" is installed from ${matches.map((p) => p.marketplace).join(", ")}.`,
			{ code: "ambiguous", plugin: name },
		);
	}
	return matches[0];
}
