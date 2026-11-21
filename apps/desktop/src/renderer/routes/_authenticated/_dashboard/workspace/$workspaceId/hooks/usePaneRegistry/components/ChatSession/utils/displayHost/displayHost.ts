/** The site a web link points at, without `www.` or a trailing dot. */
export function displayHost(url: string): string {
	try {
		const { hostname, protocol } = new URL(url);
		if (!/^https?:$/.test(protocol) || !hostname) return url;
		return hostname
			.replace(/\.$/, "")
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return url;
	}
}
