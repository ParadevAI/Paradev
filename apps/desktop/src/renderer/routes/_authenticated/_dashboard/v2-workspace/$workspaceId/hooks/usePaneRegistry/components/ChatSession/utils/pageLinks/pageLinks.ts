import { withOwnDomainTwins } from "@superset/shared/own-domains";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";

export type PageLink = { slug: string; url: string };

/** Every Superset page a text links, once each, in the order it first names them. */
export type PageLinkFinder = (text: string) => PageLink[];

const URL_PATTERN = /https?:\/\/[^\s\p{Cc}<>"'`()[\]{}\\|^]+/gu;
const TRAILING_PUNCTUATION = /[.,;:!?*_~]+$/;

function pageUrlPrefixes(webUrl: string): string[] {
	try {
		return withOwnDomainTwins([new URL(webUrl).origin]).map(
			(origin) => `${origin}/page/`,
		);
	} catch {
		return [];
	}
}

/**
 * Bound to the web origin once, because the transcript asks about every tool
 * output on every update and most of them link no page at all.
 */
export function pageLinkFinder(webUrl: string): PageLinkFinder {
	const prefixes = pageUrlPrefixes(webUrl);
	return (text) => {
		if (!prefixes.some((prefix) => text.includes(prefix))) return [];
		const links = new Map<string, PageLink>();
		for (const [candidate] of text.matchAll(URL_PATTERN)) {
			if (!prefixes.some((prefix) => candidate.startsWith(prefix))) continue;
			const url = candidate.replace(TRAILING_PUNCTUATION, "");
			const slug = parseSupersetPageUrl(url, webUrl);
			if (slug && !links.has(slug)) links.set(slug, { slug, url });
		}
		return [...links.values()];
	};
}
