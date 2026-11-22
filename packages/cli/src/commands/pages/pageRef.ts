const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_PATH = /^\/page\/([^/]+)\/?$/;

function pageLink(value: string): { slug: string; url: URL } | null {
	if (!URL.canParse(value)) return null;
	const url = new URL(value);
	const match = PAGE_PATH.exec(url.pathname);
	const slug = match?.[1] && decodedSegment(match[1]);
	return slug ? { slug, url } : null;
}

function decodedSegment(segment: string): string | null {
	try {
		return decodeURIComponent(segment);
	} catch {
		return null;
	}
}

export function pageRefFromArg(
	value: string,
): { id: string } | { slug: string } {
	const ref = pageLink(value)?.slug ?? value;
	return UUID.test(ref) ? { id: ref } : { slug: ref };
}

export function pageLinkVersion(value: string): number | undefined {
	const version = Number(pageLink(value)?.url.searchParams.get("v"));
	return Number.isInteger(version) && version > 0 ? version : undefined;
}
