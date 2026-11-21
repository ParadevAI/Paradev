import { withOwnDomainTwins } from "@superset/shared/own-domains";

export function apiUrlFromRedirect({
	redirect,
	apiUrl,
}: {
	redirect: string | null;
	apiUrl: string;
}): URL | null {
	if (!redirect) return null;
	let url: URL;
	try {
		url = new URL(redirect);
	} catch {
		return null;
	}
	const apiOrigins = withOwnDomainTwins([apiUrl]).map((u) => new URL(u).origin);
	return apiOrigins.includes(url.origin) ? url : null;
}
