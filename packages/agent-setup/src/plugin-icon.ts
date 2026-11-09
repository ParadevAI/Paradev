import fs from "node:fs";
import path from "node:path";
import { readInstalledPlugins } from "./plugin-state";

export const PLUGIN_ICON_MAX_BYTES = 256 * 1024;

const ICON_MIME_TYPES: Record<string, string> = {
	".svg": "image/svg+xml",
	".png": "image/png",
	".webp": "image/webp",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
};

/**
 * The file a manifest `icon` names inside the plugin, or null when the value
 * is a slug, a URL, an absolute path, or leaves the plugin directory.
 */
export function pluginIconFile(
	icon: unknown,
): { relative: string; mime: string } | null {
	if (typeof icon !== "string") return null;
	const relative = icon.startsWith("./") ? icon.slice(2) : icon;
	const segments = relative.split("/");
	if (
		!relative ||
		relative.includes("\\") ||
		relative.includes("\0") ||
		relative.includes(":") ||
		segments.some((segment) => !segment || segment === "." || segment === "..")
	) {
		return null;
	}
	const mime = ICON_MIME_TYPES[path.extname(relative).toLowerCase()];
	return mime ? { relative, mime } : null;
}

export function manifestIcon(manifest: unknown): unknown {
	const extensions = (manifest as { extensions?: unknown } | null)?.extensions;
	const superset = (extensions as { superset?: unknown } | undefined)?.superset;
	const ui = (superset as { interface?: unknown } | undefined)?.interface;
	return (ui as { icon?: unknown } | undefined)?.icon;
}

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
	} catch {
		return [];
	}
	return installed.flatMap((entry) => {
		const url = entry.installPath ? readPluginIcon(entry.installPath) : null;
		return url
			? [{ marketplace: entry.marketplace, name: entry.name, url }]
			: [];
	});
}
