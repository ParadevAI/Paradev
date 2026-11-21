import { getConnector } from "@superset/shared/connectors";
import { apiUrlFromRedirect } from "../apiUrlFromRedirect";

const CONNECT_PATH = /^\/api\/connectors\/([^/]+)\/connect$/;

export function connectorNameFromRedirect(args: {
	redirect: string | null;
	apiUrl: string;
}): string | null {
	const url = apiUrlFromRedirect(args);
	const slug = url && CONNECT_PATH.exec(url.pathname)?.[1];
	return (slug && getConnector(slug)?.displayName) || null;
}
