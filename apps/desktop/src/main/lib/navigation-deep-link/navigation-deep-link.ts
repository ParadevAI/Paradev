export function navigationDeepLinkPath(url: string): string | null {
	try {
		const parsed = new URL(url);
		return `/${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return null;
	}
}
