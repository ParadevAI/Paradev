import { isOwnOriginTwin } from "@superset/shared/own-domains";

export function parseSupersetPageUrl(
	url: string,
	webUrl: string,
): string | null {
	let parsed: URL;
	let web: URL;
	try {
		parsed = new URL(url);
		web = new URL(webUrl);
	} catch {
		return null;
	}

	if (!isOwnOriginTwin(parsed.origin, web.origin)) return null;

	const match = parsed.pathname.match(/^\/page\/([^/]+)\/?$/);
	const slug = match?.[1];
	if (!slug) return null;

	try {
		return decodeURIComponent(slug);
	} catch {
		return slug;
	}
}
