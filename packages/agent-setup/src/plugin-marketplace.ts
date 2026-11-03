import { isSafePluginSegment } from "./plugin-cache";
import { PluginError } from "./plugin-error";

export const MARKETPLACE_FILE = ".agent-marketplace.json";

export function assertSafeSegment(value: string, label: string): string {
	if (!isSafePluginSegment(value)) {
		throw new PluginError(
			`Refusing to use ${label} "${value}": it must be alphanumeric with dots, dashes, pluses, or underscores, and cannot contain "..".`,
		);
	}
	return value;
}

export interface MarketplaceEntry {
	name: string;
	description?: string;
	author?: { name: string; url?: string };
	category?: string;
	source: string;
	version?: string;
}

export interface Marketplace {
	name: string;
	description?: string;
	owner?: { name: string; url?: string };
	plugins: MarketplaceEntry[];
	featured?: string[];
	renames?: Record<string, string>;
}

/** The git tag a published version lives at. */
export function releaseTag(name: string, version: string): string {
	return `${assertSafeSegment(name, "plugin name")}@${assertSafeSegment(version, "version")}`;
}
