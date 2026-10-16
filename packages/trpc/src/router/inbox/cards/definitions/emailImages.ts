import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { env } from "../../../../env";
import { type FileTickets, fileTickets } from "./fileTickets";

/**
 * Remote images in an email body, fetched by the API instead of the reader's
 * machine, the way Gmail fetches them through its image proxy: a sender's
 * tracking pixel sees our server, never the reader's address. The client's
 * frame allows images only from the API, so a URL this misses stays blocked.
 */

const TICKET_TTL_S = 6 * 60 * 60;
const URL_MAX = 2048;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const REDIRECTS_MAX = 3;

const ticketSchema = z.object({ u: z.string().url().max(URL_MAX) });
type Ticket = z.infer<typeof ticketSchema>;

export function emailImageTickets(
	secret: string,
	now: () => number = Date.now,
): FileTickets<Ticket> {
	return fileTickets(
		{
			secret,
			purpose: "inbox.email-image",
			schema: ticketSchema,
			ttlSeconds: TICKET_TTL_S,
		},
		now,
	);
}

const tickets = () => emailImageTickets(env.USERCONTENT_TOKEN_SECRET);

export function emailImageUrl(url: string): string | null {
	if (url.length > URL_MAX || !/^https?:\/\//i.test(url)) return null;
	return `${env.NEXT_PUBLIC_API_URL}/api/inbox/email-images/${tickets().sign({ u: url })}`;
}

const ENTITIES: Record<string, string> = {
	amp: "&",
	quot: '"',
	"#34": '"',
	"#39": "'",
	apos: "'",
};

function decodeEntities(value: string): string {
	return value.replace(
		/&(amp|quot|#34|#39|apos);/gi,
		(_, name: string) => ENTITIES[name.toLowerCase()] ?? "",
	);
}

function absolute(raw: string): string | null {
	const url = decodeEntities(raw.trim());
	if (url.startsWith("//")) return `https:${url}`;
	return /^https?:\/\//i.test(url) ? url : null;
}

/** Every remote image reference in the HTML pointed at the proxy: `src`, `background`, `poster` and CSS `url()`. */
export function proxyEmailImages(
	html: string,
	proxy: (url: string) => string | null = emailImageUrl,
): string {
	const swap = (raw: string) => {
		const url = absolute(raw);
		return url ? proxy(url) : null;
	};
	const attributes = html.replace(
		/(\s(?:src|background|poster)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi,
		(whole, lead: string, dq?: string, sq?: string, bare?: string) => {
			const proxied = swap(dq ?? sq ?? bare ?? "");
			return proxied ? `${lead}"${proxied}"` : whole;
		},
	);
	return attributes.replace(
		/url\(\s*(&quot;|&#34;|&#39;|["']?)\s*([^"')&]*(?:&amp;[^"')&]*)*)\s*\1\s*\)/gi,
		(whole, _quote: string, raw: string) => {
			const proxied = swap(raw);
			return proxied ? `url('${proxied}')` : whole;
		},
	);
}

function privateAddress(address: string): boolean {
	if (isIP(address) === 6) {
		const lower = address.toLowerCase();
		if (lower.startsWith("::ffff:")) return privateAddress(lower.slice(7));
		return (
			lower === "::1" ||
			lower === "::" ||
			/^f[cd]/.test(lower) ||
			/^fe[89ab]/.test(lower)
		);
	}
	const [a = 0, b = 0] = address.split(".").map(Number);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a >= 224
	);
}

/** Public hosts only: the proxy must never become a way into our own network. */
export async function publicUrl(raw: string): Promise<URL | null> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.username || url.password) return null;
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost")) return null;
	const addresses = isIP(host)
		? [host]
		: await lookup(host, { all: true, verbatim: true })
				.then((all) => all.map((entry) => entry.address))
				.catch(() => []);
	if (addresses.length === 0 || addresses.some(privateAddress)) return null;
	return url;
}

const NOT_FOUND = () => new Response("Not found", { status: 404 });

/** The image behind a ticket, fetched without cookies, referrer or the reader's address. */
export async function serveEmailImage(
	token: string,
	read: FileTickets<Ticket>["read"] = (t) => tickets().read(t),
	check: typeof publicUrl = publicUrl,
): Promise<Response> {
	const ticket = read(token);
	if (!ticket) return NOT_FOUND();
	let target = ticket.u;
	let response: Response | null = null;
	for (let hop = 0; hop <= REDIRECTS_MAX; hop++) {
		const url = await check(target);
		if (!url) return NOT_FOUND();
		response = await fetch(url, {
			redirect: "manual",
			headers: { accept: "image/*", "user-agent": "Superset-ImageProxy" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		}).catch(() => null);
		if (!response) return NOT_FOUND();
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) break;
		target = new URL(location, url).toString();
		response = null;
	}
	const type = response?.headers.get("content-type") ?? "";
	const length = Number(response?.headers.get("content-length") ?? 0);
	if (
		!response?.ok ||
		!response.body ||
		!type.toLowerCase().startsWith("image/") ||
		length > IMAGE_MAX_BYTES
	) {
		return NOT_FOUND();
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > IMAGE_MAX_BYTES) return NOT_FOUND();
	return new Response(bytes, {
		headers: {
			"content-type": type,
			"cache-control": `private, max-age=${TICKET_TTL_S}`,
			"x-content-type-options": "nosniff",
			"content-security-policy":
				"default-src 'none'; style-src 'unsafe-inline'; sandbox",
		},
	});
}
