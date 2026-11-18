import { isOwnOriginTwin } from "@superset/shared/own-domains";

const DEEP_LINK_HOSTS = ["workspace", "v2-workspace"];
const SINGLE_SEGMENT = /^\/([^/]+)\/?$/;
const WEB_WORKSPACE_PATH = /^\/workspaces\/([^/]+)\/?$/;

function decode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function workspaceSegment(parsed: URL, protocolScheme: string, web: URL) {
	if (parsed.protocol === `${protocolScheme}:`) {
		if (!DEEP_LINK_HOSTS.includes(parsed.host)) return undefined;
		return parsed.pathname.match(SINGLE_SEGMENT)?.[1];
	}
	if (!isOwnOriginTwin(parsed.origin, web.origin)) return undefined;
	return parsed.pathname.match(WEB_WORKSPACE_PATH)?.[1];
}

export function parseWorkspaceLinkUrl(
	url: string,
	{ protocolScheme, webUrl }: { protocolScheme: string; webUrl: string },
): string | null {
	let parsed: URL;
	let web: URL;
	try {
		parsed = new URL(url);
		web = new URL(webUrl);
	} catch {
		return null;
	}

	const segment = workspaceSegment(parsed, protocolScheme, web);
	return segment ? decode(segment) : null;
}
