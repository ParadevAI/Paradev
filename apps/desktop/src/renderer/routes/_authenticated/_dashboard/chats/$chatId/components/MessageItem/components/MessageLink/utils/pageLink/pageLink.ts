const PAGE_LINK =
	/^https?:\/\/[^/]+\/page\/([A-Za-z0-9][A-Za-z0-9_-]{0,200})(?:[/?#].*)?$/;

/** The page a link points at, by its slug, when it is a link to one. */
export function pageSlugFromLink(href: string | undefined): string | null {
	return href ? (PAGE_LINK.exec(href)?.[1] ?? null) : null;
}
