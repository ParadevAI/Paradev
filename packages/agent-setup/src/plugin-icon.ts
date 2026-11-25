import fs from "node:fs";
import path from "node:path";
import {
	manifestIcon,
	PLUGIN_ICON_MAX_BYTES,
	pluginIconFile,
} from "@superset/shared/plugins/plugin-icon";
import { readInstalledPlugins } from "./plugin-state";

/** The icon file's real path, when it is a small regular file inside the plugin. */
export function resolvePluginIcon(
	pluginDir: string,
	relative: string,
): string | null {
	try {
		const root = fs.realpathSync(pluginDir);
		const resolved = fs.realpathSync(path.join(root, relative));
		if (!resolved.startsWith(`${root}${path.sep}`)) return null;
		const stat = fs.statSync(resolved);
		return stat.isFile() && stat.size <= PLUGIN_ICON_MAX_BYTES
			? resolved
			: null;
	} catch {
		return null;
	}
}

/** The icon a plugin carries in its own tree, as a data URI. */
export function readPluginIcon(pluginDir: string): string | null {
	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(pluginDir, "plugin.json"), "utf-8"),
		);
		const file = pluginIconFile(manifestIcon(manifest));
		const resolved = file && resolvePluginIcon(pluginDir, file.relative);
		if (!file || !resolved) return null;
		return `data:${file.mime};base64,${fs.readFileSync(resolved).toString("base64")}`;
	} catch {
		return null;
	}
}

export interface InstalledPluginIcon {
	marketplace: string;
	name: string;
	url: string;
}

export function readInstalledPluginIcons(): InstalledPluginIcon[] {
	let installed: ReturnType<typeof readInstalledPlugins>;
	try {
		installed = readInstalledPlugins();
	} catch (error) {
		console.warn("[agent-setup] plugin icons not read:", error);
		return [];
	}
	return installed.flatMap((entry) => {
		const url = entry.installPath ? readPluginIcon(entry.installPath) : null;
		return url
			? [{ marketplace: entry.marketplace, name: entry.name, url }]
			: [];
	});
}
