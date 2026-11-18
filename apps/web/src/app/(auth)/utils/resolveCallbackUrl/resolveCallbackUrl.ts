import { withOwnDomainTwins } from "@superset/shared/own-domains";

export function resolveCallbackUrl({
	redirect,
	webUrl,
	trustedOrigins,
}: {
	redirect: string | null;
	webUrl: string;
	trustedOrigins: string[];
}): string {
	if (!redirect) return webUrl;
	let url: URL;
	try {
		url = new URL(redirect, webUrl);
	} catch {
		return webUrl;
	}
	const allowed = withOwnDomainTwins([webUrl, ...trustedOrigins]).map(
		(u) => new URL(u).origin,
	);
	return allowed.includes(url.origin) ? url.href : webUrl;
}
