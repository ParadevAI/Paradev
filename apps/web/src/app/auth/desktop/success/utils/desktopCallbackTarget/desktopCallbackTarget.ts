const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * The desktop's local fallback listens on plain http at a loopback address
 * under `/auth/callback`. Returns the parsed URL when the value is exactly
 * that shape (no credentials, query, or fragment), otherwise `undefined`.
 */
export function parseLoopbackCallback(value: string): URL | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if (url.protocol !== "http:") return undefined;
	if (!LOOPBACK_HOSTS.has(url.hostname)) return undefined;
	if (url.username || url.password) return undefined;
	if (url.pathname !== "/auth/callback") return undefined;
	if (url.search || url.hash) return undefined;
	return url;
}
