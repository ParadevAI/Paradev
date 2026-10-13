import { documentIconHrefs, documentTitle } from "./html-metadata";
import {
	assertPublicTarget,
	LinkPreviewUnavailableError,
	type LookupAddresses,
	lookupAddresses,
	parseWebUrl,
} from "./public-url";

export type LinkPreview = {
	title: string | null;
	iconDataUrl: string | null;
};

export type LinkPreviewDeps = {
	fetch: (url: string, init: RequestInit) => Promise<Response>;
	lookup: LookupAddresses;
	/** One budget for the page and all its redirects, and one more for the icon. */
	timeoutMs: number;
};

const REQUEST_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 5;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_LINKED_ICONS = 2;
const MAX_CACHED_PREVIEWS = 200;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_MEDIA_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const USER_AGENT = "Mozilla/5.0 (compatible; Superset-LinkPreview/1.0)";

type Resource = { url: URL; contentType: string | null; bytes: Uint8Array };

function unavailable(message: string, cause?: unknown): never {
	throw new LinkPreviewUnavailableError(message, { cause });
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const abort = () =>
			reject(new LinkPreviewUnavailableError("The request timed out"));
		if (signal.aborted) return abort();
		signal.addEventListener("abort", abort, { once: true });
		work
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

async function readBody(
	response: Response,
	maxBytes: number,
	overflow: "truncate" | "refuse",
	signal: AbortSignal,
): Promise<Uint8Array> {
	const reader = response.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await untilAborted(
				reader
					.read()
					.catch((cause: unknown) =>
						unavailable("The response did not arrive", cause),
					),
				signal,
			);
			if (done) break;
			if (size + value.byteLength > maxBytes) {
				if (overflow === "refuse") unavailable("The response is too large");
				chunks.push(value.subarray(0, maxBytes - size));
				break;
			}
			chunks.push(value);
			size += value.byteLength;
		}
	} finally {
		reader.cancel().catch(() => {});
	}
	return Buffer.concat(chunks);
}

async function fetchResource(
	start: URL,
	request: {
		accept: string;
		maxBytes: number;
		overflow: "truncate" | "refuse";
	},
	deps: LinkPreviewDeps,
	signal: AbortSignal,
): Promise<Resource> {
	let url = start;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		await untilAborted(assertPublicTarget(url, deps.lookup), signal);
		const response = await deps
			.fetch(url.href, {
				redirect: "manual",
				signal,
				headers: { Accept: request.accept, "User-Agent": USER_AGENT },
			})
			.catch((cause: unknown) =>
				unavailable("The request did not complete", cause),
			);
		if (REDIRECT_STATUSES.has(response.status)) {
			response.body?.cancel().catch(() => {});
			url = parseWebUrl(response.headers.get("location") ?? "", url);
			continue;
		}
		if (!response.ok) {
			response.body?.cancel().catch(() => {});
			unavailable(`The request failed with ${response.status}`);
		}
		const declared = Number(response.headers.get("content-length"));
		if (request.overflow === "refuse" && declared > request.maxBytes) {
			response.body?.cancel().catch(() => {});
			unavailable("The response is too large");
		}
		return {
			url,
			contentType: response.headers.get("content-type"),
			bytes: await readBody(
				response,
				request.maxBytes,
				request.overflow,
				signal,
			),
		};
	}
	return unavailable("Too many redirects");
}

function imageMediaType(bytes: Uint8Array): string | null {
	const startsWith = (...signature: number[]) =>
		signature.every((byte, index) => bytes[index] === byte);
	if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
		return "image/png";
	}
	if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
	const ascii = Buffer.from(bytes.subarray(0, 12)).toString("latin1");
	if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) {
		return "image/gif";
	}
	if (ascii.startsWith("RIFF") && ascii.slice(8) === "WEBP") {
		return "image/webp";
	}
	if (startsWith(0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
	return null;
}

async function loadIcon(
	html: string,
	page: URL,
	deps: LinkPreviewDeps,
): Promise<string | null> {
	const signal = AbortSignal.timeout(deps.timeoutMs);
	const tried = new Set<string>();
	const hrefs = [
		...documentIconHrefs(html).slice(0, MAX_LINKED_ICONS),
		"/favicon.ico",
	];
	for (const href of hrefs) {
		try {
			const url = parseWebUrl(href, page);
			if (tried.has(url.href)) continue;
			tried.add(url.href);
			const icon = await fetchResource(
				url,
				{
					accept: "image/*,*/*;q=0.1",
					maxBytes: MAX_ICON_BYTES,
					overflow: "refuse",
				},
				deps,
				signal,
			);
			const mediaType = imageMediaType(icon.bytes);
			if (mediaType) {
				const encoded = Buffer.from(icon.bytes).toString("base64");
				return `data:${mediaType};base64,${encoded}`;
			}
		} catch (error) {
			if (!(error instanceof LinkPreviewUnavailableError)) throw error;
		}
	}
	return null;
}

async function loadLinkPreview(
	rawUrl: string,
	deps: LinkPreviewDeps,
): Promise<LinkPreview> {
	const page = await fetchResource(
		parseWebUrl(rawUrl),
		{
			accept: "text/html,application/xhtml+xml;q=0.9",
			maxBytes: MAX_PAGE_BYTES,
			overflow: "truncate",
		},
		deps,
		AbortSignal.timeout(deps.timeoutMs),
	);
	const mediaType = page.contentType?.split(";")[0]?.trim().toLowerCase();
	if (mediaType && !HTML_MEDIA_TYPES.has(mediaType)) {
		return { title: null, iconDataUrl: null };
	}
	const html = new TextDecoder().decode(page.bytes);
	return {
		title: documentTitle(html),
		iconDataUrl: await loadIcon(html, page.url, deps),
	};
}

export function createLinkPreviewLoader(
	overrides: Partial<LinkPreviewDeps> = {},
): (rawUrl: string) => Promise<LinkPreview> {
	const deps: LinkPreviewDeps = {
		fetch: (url, init) => fetch(url, init),
		lookup: lookupAddresses,
		timeoutMs: REQUEST_TIMEOUT_MS,
		...overrides,
	};
	const cache = new Map<string, Promise<LinkPreview>>();
	return (rawUrl) => {
		const key = rawUrl.trim();
		const cached = cache.get(key);
		if (cached) return cached;
		const pending = loadLinkPreview(key, deps);
		cache.set(key, pending);
		pending.catch(() => {
			if (cache.get(key) === pending) cache.delete(key);
		});
		const oldest = cache.keys().next().value;
		if (cache.size > MAX_CACHED_PREVIEWS && oldest !== undefined) {
			cache.delete(oldest);
		}
		return pending;
	};
}
