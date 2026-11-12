const ENTRY_PATHS = new Set(["/sign-in", "/sign-up", "/auth/desktop/success"]);
export function acquisitionEntry(url: URL, headers: Headers): URL | null {
	if (
		!ENTRY_PATHS.has(url.pathname) ||
		url.searchParams.get("_acq") === "1" ||
		headers.has("next-router-prefetch") ||
		headers.get("purpose") === "prefetch"
	)
		return null;
	const target = new URL("/api/acquisition/begin", url.origin);
	target.searchParams.set("returnTo", url.pathname + url.search);
	return target;
}
