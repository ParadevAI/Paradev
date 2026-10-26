const authPageRoutes = ["/sign-in", "/sign-up"] as const;

const otherPublicRoutes = [
	"/auth/desktop",
	"/api/auth/desktop",
	"/accept-invitation",
	"/cli/auth/code",
	// Deep link passthroughs: they render nothing but a bounce into the desktop
	// app, so a sign-in wall only strands the recipient of a shared link.
	"/tasks",
	"/automations",
	"/page",
	"/robots.txt",
	"/.well-known/apple-app-site-association",
] as const;

const publicRoutes = [...authPageRoutes, ...otherPublicRoutes] as const;

/** Routes only visible to signed-in company accounts (STAFF_EMAIL_DOMAINS). */
const internalRoutes = ["/design"] as const;

function matchesRouteOrChild(pathname: string, route: string): boolean {
	return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => matchesRouteOrChild(pathname, route));
}

export function isAuthPageRoute(pathname: string): boolean {
	return authPageRoutes.some((route) => matchesRouteOrChild(pathname, route));
}

/** `redirect` comes from the query string, so only same-origin paths pass; `//host` and `/\host` are other origins to a browser. */
export function safeRedirectPath(redirect: string | null): string | null {
	if (!redirect?.startsWith("/") || /^\/[/\\]/.test(redirect)) return null;
	const pathname = redirect.split(/[?#]/)[0] ?? "";
	return isAuthPageRoute(pathname) ? null : redirect;
}

export function isInternalRoute(pathname: string): boolean {
	return internalRoutes.some((route) => matchesRouteOrChild(pathname, route));
}
