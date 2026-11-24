import { DEEP_LINK_SCHEMES } from "shared/constants";

export function isDeepLinkUrl(
	url: string,
	schemes: readonly string[] = DEEP_LINK_SCHEMES,
): boolean {
	try {
		return schemes.includes(new URL(url).protocol.slice(0, -1));
	} catch {
		return false;
	}
}

export function findDeepLinkInArgv(
	argv: string[],
	schemes: readonly string[] = DEEP_LINK_SCHEMES,
): string | undefined {
	return argv.find((arg) => isDeepLinkUrl(arg, schemes));
}

/** `superset://tasks/my-slug` and `paradev://tasks/my-slug` both route to `/tasks/my-slug`. */
export function deepLinkToRoute(url: string): string {
	// Links minted before the route rename (older CLIs, published pages).
	return `/${url.slice(url.indexOf("://") + 3)}`.replace(
		/^\/v2-workspace(s)?\b/,
		"/workspace$1",
	);
}
