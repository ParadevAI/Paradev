import { z } from "zod";

const LEGACY_WEB = "https://app.superset.sh";
const LEGACY_API = "https://api.superset.sh";
const CONTINUATION_PATH = "/auth/integration-connect";
const PROVIDERS = ["sentry", "notion", "microsoft-teams"] as const;
const FALLBACK_ORIGINS = new Set([
	"https://api.paradev.com",
	"https://api.stage.paradev.com",
]);

function exactHost(request: Request, url: URL): boolean {
	return (
		!url.username &&
		!url.password &&
		["host", "x-forwarded-host"].every((name) => {
			const value = request.headers.get(name);
			return value === null || value === url.host;
		})
	);
}

function organizationId(url: URL): string | null {
	const values = url.searchParams.getAll("organizationId");
	if (values.length !== 1) return null;
	const parsed = z.uuid().safeParse(values[0]);
	return parsed.success ? parsed.data : null;
}

function redirect(url: URL): Response {
	return new Response(null, {
		status: 307,
		headers: { location: url.href, "cache-control": "private, no-store" },
	});
}

function invalid(status: number): Response {
	return new Response(null, {
		status,
		headers: { "cache-control": "private, no-store" },
	});
}

export async function withLegacyIntegrationConnect(
	request: Request,
	fallback: () => Promise<Response>,
): Promise<Response> {
	const url = new URL(request.url);
	const provider = PROVIDERS.find(
		(value) => url.pathname === `/api/integrations/${value}/connect`,
	);
	if (!FALLBACK_ORIGINS.has(url.origin) || !provider) {
		return fallback();
	}
	if (!exactHost(request, url)) return invalid(400);
	if (request.method !== "GET") return invalid(405);
	const orgId = organizationId(url);
	if (!orgId) return invalid(400);
	const target = new URL(CONTINUATION_PATH, LEGACY_WEB);
	target.searchParams.set("provider", provider);
	target.searchParams.set("organizationId", orgId);
	return redirect(target);
}

export async function continueLegacyIntegrationConnect(
	request: Request,
	isSignedIn: () => Promise<boolean>,
): Promise<Response> {
	const url = new URL(request.url);
	if (
		url.origin !== LEGACY_WEB ||
		url.pathname !== CONTINUATION_PATH ||
		!exactHost(request, url)
	)
		return invalid(404);
	if (request.method !== "GET") return invalid(405);
	const providers = url.searchParams.getAll("provider");
	const provider = PROVIDERS.find((value) => providers[0] === value);
	const orgId = organizationId(url);
	if (providers.length !== 1 || !provider || !orgId) return invalid(400);
	if (!(await isSignedIn())) {
		const continuation = new URL(CONTINUATION_PATH, LEGACY_WEB);
		continuation.searchParams.set("provider", provider);
		continuation.searchParams.set("organizationId", orgId);
		const signIn = new URL("/sign-in", LEGACY_WEB);
		signIn.searchParams.set(
			"redirect",
			continuation.pathname + continuation.search,
		);
		return redirect(signIn);
	}
	const target = new URL(`/api/integrations/${provider}/connect`, LEGACY_API);
	target.searchParams.set("organizationId", orgId);
	return redirect(target);
}
