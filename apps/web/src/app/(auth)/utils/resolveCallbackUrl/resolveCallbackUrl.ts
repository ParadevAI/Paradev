import { withOwnDomainTwins } from "@superset/shared/own-domains";
import { adminReturnUrl } from "@/proxy-routes";

export function resolveCallbackUrl({
	redirect,
	webUrl,
	trustedOrigins,
	adminUrl,
}: {
	redirect: string | null;
	webUrl: string;
	trustedOrigins: string[];
	adminUrl?: string;
}): string {
	if (!redirect) return webUrl;
	const admin = adminReturnUrl(redirect, adminUrl);
	if (admin) return admin.href;
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
