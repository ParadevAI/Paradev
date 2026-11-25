import path from "node:path";

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
