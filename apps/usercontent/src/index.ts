import * as Sentry from "@sentry/cloudflare";
import { PAGE_COMMENTS_RUNTIME_SOURCE } from "@superset/shared/page-comments-runtime";
import {
	injectScriptTag,
	type PageManifest,
	type PageTicketClaims,
	pageContentSecurityPolicy,
	pageIdFromHost,
	pageManifestKey,
	pageThumbnailKey,
	parsePageManifest,
	RUNTIME_SCRIPT_PATH,
	servedVersionOf,
	THUMBNAIL_FILENAME,
	TICKET_QUERY_PARAM,
	verifyPageTicket,
} from "@superset/shared/usercontent";
import { type Context, Hono } from "hono";
import { assertEnv, type UsercontentEnv } from "./env";

type AppContext = { Bindings: UsercontentEnv };

const app = new Hono<AppContext>();

const IMMUTABLE = "public, max-age=31536000, immutable";

function baseHost(c: Context<AppContext>): string {
	return new URL(c.env.USERCONTENT_URL).host;
}

function requestHost(c: Context<AppContext>): string {
	return c.req.header("host") ?? new URL(c.req.url).host;
}

function notFound(): Response {
	return new Response("Not found", {
		status: 404,
		headers: { "Cache-Control": "no-store" },
	});
}

async function loadManifest(
	c: Context<AppContext>,
): Promise<PageManifest | null> {
	const pageId = pageIdFromHost(requestHost(c), baseHost(c));
	if (!pageId) return null;
	const object = await c.env.PRIVATE.get(pageManifestKey(pageId));
	if (!object) return null;
	return parsePageManifest(await object.text());
}

function requestTicket(c: Context<AppContext>): string | undefined {
	// The path form carries its `~` marker in the matched segment.
	const segment = c.req.param("ticket");
	if (segment?.startsWith("~")) return segment.slice(1);
	return c.req.query(TICKET_QUERY_PARAM);
}

function requestedVersion(c: Context<AppContext>): number | null | undefined {
	const raw = c.req.param("version");
	if (raw === undefined) return null;
	if (!/^[1-9]\d{0,8}$/.test(raw)) return undefined;
	return Number(raw);
}

/**
 * A public page is open. Anything narrower needs the ticket the API minted
 * for it — for this page, and if the ticket names a version, for this one.
 */
async function authorized(
	c: Context<AppContext>,
	manifest: PageManifest,
	version: number,
): Promise<PageTicketClaims | "public" | null> {
	if (manifest.visibility === "everyone") return "public";
	const ticket = requestTicket(c);
	if (!ticket) return null;
	const claims = await verifyPageTicket(
		[
			c.env.USERCONTENT_TOKEN_SECRET,
			c.env.USERCONTENT_TOKEN_SECRET_PREVIOUS ?? "",
		],
		ticket,
	);
	if (!claims || claims.pageId !== manifest.pageId) return null;
	return claims.version === undefined || claims.version === version
		? claims
		: null;
}

function signInRedirect(c: Context<AppContext>, slug: string): Response {
	return new Response(null, {
		status: 302,
		headers: {
			Location: `${c.env.APP_URL.replace(/\/$/, "")}/page/${slug}`,
			"Cache-Control": "no-store",
		},
	});
}

async function servePage(c: Context<AppContext>): Promise<Response> {
	const manifest = await loadManifest(c);
	if (!manifest) return notFound();

	const requested = requestedVersion(c);
	if (requested === undefined) return notFound();
	const version = requested ?? servedVersionOf(manifest);
	if (version === null) return notFound();
	const entry = manifest.versions[String(version)];
	if (!entry) return notFound();

	if (!(await authorized(c, manifest, version))) {
		return signInRedirect(c, manifest.slug);
	}

	const object = await c.env.PRIVATE.get(entry.key);
	if (!object) return notFound();

	const contentType = object.httpMetadata?.contentType ?? entry.contentType;
	const isHtml = contentType.startsWith("text/html");
	const ticketed = manifest.visibility !== "everyone";
	const headers = new Headers({
		"Content-Type": isHtml ? "text/html; charset=utf-8" : contentType,
		// Each page is its own origin; ask for an origin-keyed agent cluster
		// so sibling pages never share a renderer process while the PSL entry
		// propagates.
		"Origin-Agent-Cluster": "?1",
		"Superset-Storage-Key": entry.key,
		"Content-Security-Policy": pageContentSecurityPolicy(
			c.env.FRAME_ANCESTORS.split(/\s+/).filter(Boolean),
		),
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "no-referrer",
		"X-Robots-Tag": "noindex, nofollow",
		"Cache-Control": ticketed
			? "private, no-store"
			: requested === null
				? "no-cache"
				: IMMUTABLE,
	});

	if (!isHtml) return new Response(object.body, { headers });
	return new Response(
		injectScriptTag(await object.text(), RUNTIME_SCRIPT_PATH),
		{ headers },
	);
}

async function serveThumbnail(c: Context<AppContext>): Promise<Response> {
	const manifest = await loadManifest(c);
	if (!manifest) return notFound();
	const version = requestedVersion(c);
	if (!version) return notFound();
	const auth = await authorized(c, manifest, version);
	if (!auth) return notFound();

	const key = pageThumbnailKey(manifest.pageId, version);
	const object = await c.env.PRIVATE.get(key);
	if (!object) return notFound();
	// A restricted thumbnail may live in the browser cache only as long as
	// the ticket that fetched it: after a visibility flip, stale copies age
	// out with the ticket instead of surviving another day.
	const remaining =
		auth === "public"
			? null
			: Math.max(0, Math.min(auth.exp - Math.floor(Date.now() / 1000), 86400));
	return new Response(object.body, {
		headers: {
			"Content-Type": "image/jpeg",
			"Superset-Storage-Key": key,
			"X-Content-Type-Options": "nosniff",
			"Cache-Control":
				remaining === null ? IMMUTABLE : `private, max-age=${remaining}`,
		},
	});
}

// Pages hang off `frame.<zone>`; the zone apex and `frame.` itself have
// nothing to serve, so readers arriving there belong in the app.
app.use("*", async (c, next) => {
	assertEnv(c.env);
	const host = requestHost(c);
	const base = baseHost(c);
	const apex = base.slice(base.indexOf(".") + 1);
	if (host !== base && host !== apex) return next();
	if (c.req.path === "/health") return c.json({ ok: true });
	return c.redirect(c.env.APP_URL, 302);
});

app.get(RUNTIME_SCRIPT_PATH, (c) =>
	c.body(PAGE_COMMENTS_RUNTIME_SOURCE, 200, {
		"Content-Type": "text/javascript; charset=utf-8",
		"Cache-Control": "public, max-age=300",
	}),
);

// Relative references resolve against the directory the document was
// served from, so slashless forms redirect — never a second address — and a
// private document lives under its ticket segment (`/versions/3/~<ticket>/`)
// so every relative reference inherits the ticket.
const addTrailingSlash = (c: Context<AppContext>): Response => {
	const url = new URL(c.req.url);
	url.pathname = `${url.pathname}/`;
	return c.redirect(url.toString(), 301);
};

app.get("/", servePage);
app.get("/:ticket{~[^/]+}", addTrailingSlash);
app.get("/:ticket{~[^/]+}/", servePage);
app.get("/versions/:version", addTrailingSlash);
app.get("/versions/:version/", servePage);
app.get("/versions/:version/:ticket{~[^/]+}", addTrailingSlash);
app.get("/versions/:version/:ticket{~[^/]+}/", servePage);
app.get(`/versions/:version/${THUMBNAIL_FILENAME}`, serveThumbnail);
app.notFound(() => notFound());

// Exceptions only; no-op until SENTRY_DSN is set.
const sentryOptions = (env: UsercontentEnv): Sentry.CloudflareOptions => ({
	dsn: env.SENTRY_DSN,
	tracesSampleRate: 0,
	sendDefaultPii: false,
	integrations: (defaults) =>
		defaults.filter((integration) => integration.name !== "Console"),
});

export default Sentry.withSentry(sentryOptions, {
	fetch: app.fetch,
} satisfies ExportedHandler<UsercontentEnv>);
