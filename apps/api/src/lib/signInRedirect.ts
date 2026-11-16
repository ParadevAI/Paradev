import {
	OWN_ROOT_DOMAINS,
	withOwnDomainTwins,
} from "@superset/shared/own-domains";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "@/env";

function ownRootOf(hostname: string): string | undefined {
	return OWN_ROOT_DOMAINS.find(
		(root) => hostname === root || hostname.endsWith(`.${root}`),
	);
}

/** Browsers without fetch metadata still send `Accept: text/html` on navigation. */
export function isBrowserNavigation(request: Request): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return false;
	const dest = request.headers.get("sec-fetch-dest");
	if (dest) return dest === "document";
	return (request.headers.get("accept") ?? "").includes("text/html");
}

/** The session cookie is scoped to one root domain, so send the browser to the web app on the request's. */
function webPageFor(request: Request, path: string): URL {
	const root = ownRootOf(new URL(request.url).hostname);
	const web =
		withOwnDomainTwins([env.NEXT_PUBLIC_WEB_URL]).find(
			(url) => ownRootOf(new URL(url).hostname) === root,
		) ?? env.NEXT_PUBLIC_WEB_URL;
	const page = new URL(path, web);
	page.searchParams.set("redirect", request.url);
	return page;
}

export function signInUrl(request: Request): URL {
	const signIn = webPageFor(request, "/sign-in");
	if (getSessionCookie(request))
		signIn.searchParams.set("reason", "session_expired");
	return signIn;
}

/** A person opening the URL is sent to sign in and back; any other caller gets `fallback`. */
export function unauthenticatedResponse(
	request: Request,
	fallback: Response,
): Response {
	return isBrowserNavigation(request)
		? Response.redirect(signInUrl(request).toString(), 302)
		: fallback;
}

/** A person signed in to the wrong account is offered to switch accounts and come back; any other caller gets `fallback`. */
export function wrongAccountResponse(
	request: Request,
	fallback: Response,
): Response {
	return isBrowserNavigation(request)
		? Response.redirect(
				webPageFor(request, "/auth/switch-account").toString(),
				302,
			)
		: fallback;
}
