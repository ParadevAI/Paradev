/** A short-lived link to a shared file's bytes, as the API signs it. */
export interface FileLink {
	url: string;
	expiresAt: string;
}

/** A link with less than this left is fetched again rather than handed out: it has to last while it's opened. */
const MARGIN_MS = 60_000;

/**
 * Reuses each file's link while it's fresh, so a card's thumbnail and its preview share one, and a file opened twice
 * doesn't ask the API twice. Concurrent asks for the same file share one request.
 */
export function cachedFileLinks(
	load: (fileId: string) => Promise<FileLink>,
	now: () => number = Date.now,
) {
	const links = new Map<string, Promise<FileLink>>();
	return (fileId: string): Promise<FileLink> => {
		const cached = links.get(fileId);
		if (cached)
			return cached.then((link) =>
				new Date(link.expiresAt).getTime() - MARGIN_MS > now()
					? link
					: fresh(fileId),
			);
		return fresh(fileId);
	};

	function fresh(fileId: string) {
		const link = load(fileId);
		links.set(fileId, link);
		link.catch(() => links.delete(fileId));
		return link;
	}
}
