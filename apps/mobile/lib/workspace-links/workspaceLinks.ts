const APP_SCHEME = "superset:";

function singleSegment(pathname: string, prefix: string): string | null {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length !== 2 || segments[0] !== prefix) return null;
	const id = segments[1] ?? "";
	try {
		return decodeURIComponent(id) || null;
	} catch {
		return null;
	}
}

/**
 * Reads the workspace id from a shared web link (`<web>/workspaces/<id>`), or
 * from the desktop deep link (`superset://v2-workspace/<id>`) that the web page
 * redirects to when iOS opens the link in Safari.
 */
export function workspaceIdFromUrl(url: string, webUrl: string): string | null {
	let target: URL;
	let web: URL;
	try {
		target = new URL(url);
		web = new URL(webUrl);
	} catch {
		return null;
	}
	if (target.protocol === APP_SCHEME) {
		return singleSegment(`/${target.host}${target.pathname}`, "v2-workspace");
	}
	if (target.origin !== web.origin) return null;
	return singleSegment(target.pathname, "workspaces");
}
