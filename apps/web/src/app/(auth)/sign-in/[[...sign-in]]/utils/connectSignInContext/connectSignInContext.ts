import { getConnector } from "@superset/shared/connectors";
import { withOwnDomainTwins } from "@superset/shared/own-domains";

export type ConnectSignIn = {
	connectorName: string;
	sessionExpired: boolean;
};

const CONNECT_PATH = /^\/api\/connectors\/([^/]+)\/connect$/;

export function connectSignInContext({
	redirect,
	reason,
	apiUrl,
}: {
	redirect: string | null;
	reason: string | null;
	apiUrl: string;
}): ConnectSignIn | null {
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
	const connector = slug ? getConnector(slug) : undefined;
	if (!connector) return null;

	return {
		connectorName: connector.displayName,
		sessionExpired: reason === "session_expired",
	};
}
