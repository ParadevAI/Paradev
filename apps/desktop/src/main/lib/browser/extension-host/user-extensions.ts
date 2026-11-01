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
