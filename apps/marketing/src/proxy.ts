import { isSupportedLocale } from "@superset/i18n";
import { isProfileHandle } from "@superset/trpc/leaderboard-reserved-handles";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
	CONSENT_REGION_COOKIE,
	consentRegionForCountry,
} from "@/lib/analytics/consent-region";
import { geoFromRequestHeaders, geoServerTiming } from "@/lib/analytics/geo";
import { canonicalPathname } from "@/lib/canonical-pathname";

export function proxy(request: NextRequest) {
	const response = route(request) ?? NextResponse.next();
	const value = consentRegionForCountry(
		request.headers.get("x-vercel-ip-country"),
		{ production: process.env.NODE_ENV === "production" },
	);
	if (request.cookies.get(CONSENT_REGION_COOKIE)?.value !== value) {
		response.cookies.set(CONSENT_REGION_COOKIE, value, {
			path: "/",
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
		});
	}
	const geo = geoServerTiming(geoFromRequestHeaders(request.headers));
	if (geo) response.headers.append("Server-Timing", geo);
	return response;
}

/**
 * Locale routing. The whole route tree lives under app/[lang], but English
 * keeps the bare URLs it has always had — every inbound link and its
 * accumulated search equity stays valid:
 *
 * - /pricing        -> rewritten internally to /en/pricing (URL bar unchanged)
 * - /ja/pricing     -> passes through, renders Japanese
 * - /en/pricing     -> 308 to /pricing, so English has exactly one URL
 * - /Pricing        -> 308 to /pricing; every route and slug is lowercase
 *
 * Deliberately no Accept-Language redirect: locale auto-redirects hide the
 * localized pages from crawlers (which send en or nothing) and break shared
 * links. Discovery is hreflang, the sitemap, and the visible switcher.
 */
function route(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const canonical = canonicalPathname(pathname);
	const segments = canonical.split("/").slice(1);
	if (segments.length > 1 && segments.at(-1) === "") segments.pop();
	const [first = "", ...rest] = segments;
	const [second = "", ...tail] = rest;

	const redirectTo = (target: string) => {
		const url = request.nextUrl.clone();
		url.pathname = target;
		return NextResponse.redirect(url, 308);
	};

	const routed =
		first === "en"
			? canonicalPathname(`/${rest.join("/")}`)
					.split("/")
					.slice(1)
			: segments;
	const [head = "", ...headRest] = routed;
	const [next = "", ...nextRest] = headRest;
	if (head === "user" && headRest.length === 1 && next) {
		return redirectTo(`/${next}`);
	}
	if (
		isSupportedLocale(head) &&
		next === "user" &&
		nextRest.length === 1 &&
		nextRest[0]
	) {
		return redirectTo(`/${head}/${nextRest[0]}`);
	}
	if (first === "en") {
		return redirectTo(`/${routed.join("/")}`);
	}
	if (canonical !== pathname) return redirectTo(canonical);

	if (isSupportedLocale(first)) {
		if (tail.length === 0 && isProfileHandle(second)) {
			const url = request.nextUrl.clone();
			url.pathname = `/${first}/user/${second}`;
			return NextResponse.rewrite(url);
		}
		return;
	}

	if (rest.length === 0 && isProfileHandle(first)) {
		const url = request.nextUrl.clone();
		url.pathname = `/en/user/${first}`;
		return NextResponse.rewrite(url);
	}

	const url = request.nextUrl.clone();
	// Keep /land available as a profile handle. Only these English child URLs
	// use the internal /en/en tree; direct /en URLs still canonicalize above.
	const barePath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
	const landingPage =
		barePath === "/land/claude-code-parallel-sessions" ||
		barePath === "/land/claude-code-worktrees" ||
		barePath === "/land/codex-cli-worktrees";
	if (landingPage && barePath !== pathname) {
		// NextURL retains the inbound trailing-slash flag when serialized.
		const target = new URL(request.url);
		target.pathname = barePath;
		return NextResponse.redirect(target, 308);
	}
	url.pathname = landingPage ? `/en/en${pathname}` : `/en${pathname}`;
	return NextResponse.rewrite(url);
}

export const config = {
	// Skip Next internals, API routes, the two same-origin analytics proxies,
	// and anything with a file extension (feeds, llms.txt, images, favicon) —
	// those live at the root on purpose.
	//
	// `ingest` (PostHog, via next.config rewrites) and `monitoring` (Sentry's
	// tunnelRoute) are extensionless, so without naming them here they get
	// rewritten to /en/... and 404. That is silent: posthog-js still loads,
	// because /ingest/static/*.js has a dot and slips through this matcher,
	// and then every capture request dies. It cost four days of marketing
	// analytics and Sentry reporting in 2026-08. apps/web and apps/api
	// exclude both for the same reason.
	matcher: ["/((?!_next|api|ingest|monitoring|.*\\..*).*)"],
};
