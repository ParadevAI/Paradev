const MAX_LABEL = 63;

/** The short form Slack shows for a pasted URL: no scheme, `www.`, port or trailing slash. */
export function linkLabel(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	const host = parsed.hostname.replace(/^www\./, "");
	const path = parsed.pathname.replace(/\/+$/, "");
	const label = `${host}${path}${parsed.search}${parsed.hash}`;
	return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL)}…` : label;
}
