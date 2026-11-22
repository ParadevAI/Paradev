export interface RedirectTarget {
	host: string;
	isLocal: boolean;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(uri: string): string | null {
	if (!URL.canParse(uri)) return null;
	const { hostname } = new URL(uri);
	return LOOPBACK_HOSTNAMES.has(hostname) ? "localhost" : hostname;
}

export function getRedirectTarget(
	redirectUri: string | undefined,
	registeredUris: string[],
): RedirectTarget | null {
	if (!redirectUri) return null;
	const requested = hostnameOf(redirectUri);
	if (!requested) return null;
	if (!registeredUris.some((uri) => hostnameOf(uri) === requested)) {
		return null;
	}
	return { host: requested, isLocal: requested === "localhost" };
}
