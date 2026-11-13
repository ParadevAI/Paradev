import { FEATURE_FLAGS } from "../constants";

const COOKIE = "__Secure-domain-move-id";
const LEGACY_WEB = "https://app.superset.sh";
const LEGACY_API = "https://api.superset.sh";
const retained = [
	"/",
	"/api",
	"/trpc",
	"/oauth",
	"/cli/auth",
	"/auth/desktop",
	"/auth/integration-connect",
	"/integrations/sentry",
	"/.well-known",
	"/mcp",
	"/accept-invitation",
	"/settings/billing",
	"/_next",
	"/ingest",
	"/monitoring",
];
const matches = (path: string, route: string) =>
	path === route || path.startsWith(`${route}/`);

function retainedPath(path: string): boolean {
	return (
		retained.some((route) => matches(path, route)) || /\.[^/]+$/.test(path)
	);
}

function ambiguous(value: string): boolean {
	return [...value].some(
		(character) =>
			character.charCodeAt(0) <= 32 || character === "\\" || character === "%",
	);
}

function safePage(url: URL, depth = 0): boolean {
	if (depth > 4) return false;
	let path: string;
	try {
		path = decodeURIComponent(url.pathname);
	} catch {
		return false;
	}
	if (ambiguous(path) || retainedPath(path)) return false;
	if (!["/sign-in", "/sign-up"].some((route) => matches(path, route)))
		return true;
	if (["client_id", "sig"].some((key) => url.searchParams.has(key)))
		return false;
	for (const value of url.searchParams.getAll("redirect")) {
		let continuation = value;
		try {
			for (let i = 0; i < 4 && continuation.includes("%"); i++) {
				continuation = decodeURIComponent(continuation);
			}
			if (ambiguous(continuation) || continuation.startsWith("//"))
				return false;
			const target = new URL(continuation, LEGACY_WEB);
			if (target.origin !== LEGACY_WEB || !safePage(target, depth + 1))
				return false;
		} catch {
			return false;
		}
	}
	return true;
}

export function domainMoveTarget(
	request: Request,
	surface: "web" | "desktop",
): URL | null {
	const url = new URL(request.url);
	const origin = surface === "web" ? LEGACY_WEB : LEGACY_API;
	if (url.origin !== origin || url.username || url.password) return null;
	// A forwarded host is never a source of authority; a conflicting one fails closed.
	const host = new URL(origin).host;
	if (
		["host", "x-forwarded-host"].some((name) => {
			const value = request.headers.get(name);
			return value !== null && value !== host;
		})
	)
		return null;
	if (surface === "desktop") {
		if (
			request.method !== "GET" ||
			url.pathname !== "/api/auth/desktop/connect"
		)
			return null;
	} else {
		if (!["GET", "HEAD"].includes(request.method) || !safePage(url))
			return null;
		if (
			[
				"next-action",
				"rsc",
				"next-router-prefetch",
				"next-router-state-tree",
				"next-router-segment-prefetch",
			].some((name) => request.headers.has(name))
		)
			return null;
		if (url.searchParams.has("_rsc")) return null;
		if (
			["purpose", "sec-purpose"].some((name) =>
				/prefetch/i.test(request.headers.get(name) ?? ""),
			)
		)
			return null;
		const mode = request.headers.get("sec-fetch-mode");
		const dest = request.headers.get("sec-fetch-dest");
		if ((mode && mode !== "navigate") || (dest && dest !== "document"))
			return null;
		if (
			!(request.headers.get("accept") ?? "")
				.split(",")
				.some(
					(type) =>
						/^\s*text\/html(?:\s*;|\s*$)/i.test(type) &&
						!/;\s*q=0(?:\.0*)?(?:;|\s*$)/i.test(type),
				)
		)
			return null;
	}
	const target = new URL(
		surface === "web" ? "https://app.paradev.com" : "https://api.paradev.com",
	);
	target.pathname = url.pathname;
	target.search = url.search;
	return target;
}

type FlagLookup = (
	key: string,
	id: string,
	options: { sendFeatureFlagEvents: false },
) => Promise<unknown>;

type Move = { location?: string; cookie?: string };

async function evaluate(
	request: Request,
	target: URL,
	lookup: FlagLookup,
	schedule: typeof setTimeout = setTimeout,
): Promise<Move> {
	const stored = (request.headers.get("cookie") ?? "")
		.slice(0, 16384)
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${COOKIE}=`))
		?.slice(COOKIE.length + 1);
	const valid =
		stored &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
			stored,
		);
	const id = valid ? stored : crypto.randomUUID();
	const cookie = !valid
		? `${COOKIE}=${id}; Domain=superset.sh; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
		: undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const flag = await Promise.race([
			Promise.resolve().then(() =>
				lookup(FEATURE_FLAGS.WEB_DOMAIN_MOVE, id, {
					sendFeatureFlagEvents: false,
				}),
			),
			new Promise<undefined>((resolve) => {
				timer = schedule(() => resolve(undefined), 500);
			}),
		]);
		return { cookie, location: flag === true ? target.href : undefined };
	} catch {
		return { cookie };
	} finally {
		clearTimeout(timer);
	}
}

function applyDomainMove(response: Response, move: Move): Response {
	if (move.cookie) response.headers.append("set-cookie", move.cookie);
	if (move.cookie || move.location)
		response.headers.set("cache-control", "private, no-store");
	return response;
}

export async function withDomainMove({
	request,
	enabled,
	surface,
	lookup,
	fallback,
	schedule,
}: {
	request: Request;
	enabled?: string;
	surface: "web" | "desktop";
	lookup: FlagLookup;
	fallback: () => Promise<Response>;
	schedule?: typeof setTimeout;
}): Promise<Response> {
	if (enabled !== "true") return fallback();
	const target = domainMoveTarget(request, surface);
	if (!target) return fallback();
	const move = await evaluate(request, target, lookup, schedule);
	const response = move.location
		? new Response(null, { status: 307, headers: { location: move.location } })
		: await fallback();
	return applyDomainMove(response, move);
}
