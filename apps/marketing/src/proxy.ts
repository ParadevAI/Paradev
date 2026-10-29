import { isSupportedLocale } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import { isProfileHandle } from "@superset/trpc/leaderboard-reserved-handles";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { canonicalPathname } from "@/lib/canonical-pathname";
import { assignHeadlineVariant } from "@/lib/hero-headline-assignment";
import { evaluateHeadlineVariant } from "@/lib/hero-headline-flags";

export async function proxy(request: NextRequest) {
	const response = route(request);
	if (
		!isHomepage(request.nextUrl.pathname) ||
		response?.headers.has("location")
	) {
		return response;
	}
	const homepage = response ?? NextResponse.next();
	await assignHeadlineVariant(request, homepage, {
		isProductionHost: isProductionHost(request),
		evaluate: evaluateHeadlineVariant,
	});
	return homepage;
}

function isHomepage(pathname: string): boolean {
	const [, first = "", ...rest] = pathname.split("/");
	return rest.length === 0 && (first === "" || isSupportedLocale(first));
}

function isProductionHost(request: NextRequest): boolean {
	const productionHost = new URL(COMPANY.MARKETING_URL).hostname;
	const { hostname } = request.nextUrl;
	return (
		process.env.NODE_ENV === "production" &&
		(hostname === productionHost || hostname === `www.${productionHost}`)
	);
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
	url.pathname = `/en${pathname}`;
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
