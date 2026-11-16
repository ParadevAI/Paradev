import { acceptsHtml } from "@superset/shared/domain-move";
import {
	OWN_ROOT_DOMAINS,
	withOwnDomainTwins,
} from "@superset/shared/own-domains";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "@/env";

const API_CLIENT_HEADERS = ["authorization", "x-api-key", "x-trpc-source"];

export function isBrowserNavigation(request: Request): boolean {
	return (
		acceptsHtml(request) &&
		!API_CLIENT_HEADERS.some((name) => request.headers.has(name))
	);
}

function ownRootOf(hostname: string): string | undefined {
	return OWN_ROOT_DOMAINS.find(
		(root) => hostname === root || hostname.endsWith(`.${root}`),
	);
}

/** The session cookie is scoped to one root domain, so use the web app on the request's. */
function webPage(request: Request, pathname: string): URL {
	const root = ownRootOf(new URL(request.url).hostname);
	const web =
		withOwnDomainTwins([env.NEXT_PUBLIC_WEB_URL]).find(
			(url) => ownRootOf(new URL(url).hostname) === root,
		) ?? env.NEXT_PUBLIC_WEB_URL;
	const page = new URL(pathname, web);
	page.searchParams.set("redirect", request.url);
	return page;
}

export function signInUrl(request: Request): URL {
	const signIn = webPage(request, "/sign-in");
	if (getSessionCookie(request))
		signIn.searchParams.set("reason", "session_expired");
	return signIn;
}

export function switchAccountUrl(request: Request): URL {
	return webPage(request, "/switch-account");
}

/** A browser goes to sign in and comes back; an API client gets `apiResponse`. */
export function signedOut(request: Request, apiResponse: Response): Response {
	return isBrowserNavigation(request)
		? Response.redirect(signInUrl(request).toString(), 302)
		: apiResponse;
}

/** A browser is offered to switch account and come back; an API client gets `apiResponse`. */
export function wrongAccount(
	request: Request,
	apiResponse: Response,
): Response {
	return isBrowserNavigation(request)
		? Response.redirect(switchAccountUrl(request).toString(), 302)
		: apiResponse;
}
