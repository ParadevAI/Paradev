import { getConnector } from "@superset/shared/connectors";
import { withOwnDomainTwins } from "@superset/shared/own-domains";

const CONNECT_PATH = /^\/api\/connectors\/([^/]+)\/connect$/;

export function connectorNameFromRedirect({
	redirect,
	apiUrl,
}: {
	redirect: string | null;
	apiUrl: string;
}): string | null {
	if (!redirect) return null;
	let url: URL;
	try {
		url = new URL(redirect);
	} catch {
		return null;
	}
	const apiOrigins = withOwnDomainTwins([apiUrl]).map((u) => new URL(u).origin);
	if (!apiOrigins.includes(url.origin)) return null;

	const slug = CONNECT_PATH.exec(url.pathname)?.[1];
	return (slug && getConnector(slug)?.displayName) || null;
}
