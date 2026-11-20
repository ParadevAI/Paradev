import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";

/**
 * Extensions the user installed from the Web Store live under the install
 * folder. Anything else in the session, such as the app's own bundled
 * extension, is not theirs to list, pin or remove.
 */
export function isUserExtension(
	extension: { path: string },
	installRoot: string,
): boolean {
	const rel = relative(installRoot, extension.path);
	return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

/** IDs of the extensions installed under the install folder, one folder each. */
export function installedExtensionIds(installRoot: string): string[] {
	try {
		return readdirSync(installRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && /^[a-p]{32}$/.test(entry.name))
			.map((entry) => entry.name);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}
