import {
	documentDescription,
	documentIconHrefs,
	documentImageHref,
	documentTitle,
} from "./html-metadata";
import { type ImageSize, imageSize } from "./image-size";
import {
	assertPublicTarget,
	LinkPreviewUnavailableError,
	type LookupAddresses,
	lookupAddresses,
	parseWebUrl,
} from "./public-url";

export type LinkPreview = {
	title: string | null;
	description: string | null;
	iconDataUrl: string | null;
	image: (ImageSize & { dataUrl: string }) | null;
};

export type LinkPreviewRequest = { url: string; image: boolean };

export const EMPTY_LINK_PREVIEW: LinkPreview = {
	title: null,
	description: null,
	iconDataUrl: null,
	image: null,
};

export type LinkPreviewDeps = {
	fetch: (url: string, init: RequestInit) => Promise<Response>;
	lookup: LookupAddresses;
	/** One budget each for the page with its redirects, the icon, and the image. */
	timeoutMs: number;
};

const REQUEST_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 5;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_SIDE = 8192;
const MAX_IMAGE_PIXELS = 16_000_000;
const HEAD_END = "</head";
const PREVIEW_IMAGE_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
]);
const MAX_LINKED_ICONS = 2;
const MAX_CACHED_PREVIEWS = 200;
// Each can hold a 1 MB image and an icon as base64, so far fewer are kept.
const MAX_CACHED_IMAGE_PREVIEWS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_MEDIA_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const USER_AGENT = "Mozilla/5.0 (compatible; Superset-LinkPreview/1.0)";

type Resource = { url: URL; contentType: string | null; bytes: Uint8Array };

type ResourceRequest = {
	accept: string;
	maxBytes: number;
	overflow: "truncate" | "refuse";
	/** A page's preview lives in its head, so the body is never needed. */
	stopAtHeadEnd?: boolean;
};

function unavailable(message: string, cause?: unknown): never {
	throw new LinkPreviewUnavailableError(message, { cause });
}

/** A `</head` outside any `<script>`, so a script's string can't end the head. */
function headEnded(html: string): boolean {
	let from = 0;
	for (;;) {
		const end = html.indexOf(HEAD_END, from);
		if (end === -1) return false;
		const before = html.slice(0, end);
		const opened = before.split("<script").length - 1;
		const closed = before.split("</script").length - 1;
		if (opened <= closed) return true;
		from = end + HEAD_END.length;
	}
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
	request: ResourceRequest,
	signal: AbortSignal,
): Promise<Uint8Array> {
	const { maxBytes, overflow } = request;
	const reader = response.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let size = 0;
	let seen = "";
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
			if (request.stopAtHeadEnd) {
				seen += Buffer.from(value).toString("latin1").toLowerCase();
				if (headEnded(seen)) break;
			}
		}
	} finally {
		reader.cancel().catch(() => {});
	}
	return Buffer.concat(chunks);
}

async function fetchResource(
	start: URL,
	request: ResourceRequest,
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
			bytes: await readBody(response, request, signal),
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

function dataUrl(mediaType: string, bytes: Uint8Array): string {
	return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function loadImage(
	href: string,
	page: URL,
	deps: LinkPreviewDeps,
): Promise<LinkPreview["image"]> {
	try {
		const image = await fetchResource(
			parseWebUrl(href, page),
			{ accept: "image/*", maxBytes: MAX_IMAGE_BYTES, overflow: "refuse" },
			deps,
			AbortSignal.timeout(deps.timeoutMs),
		);
		const mediaType = imageMediaType(image.bytes);
		if (!mediaType || !PREVIEW_IMAGE_TYPES.has(mediaType)) return null;
		const size = imageSize(image.bytes, mediaType);
		if (
			!size ||
			size.width <= 0 ||
			size.height <= 0 ||
			size.width > MAX_IMAGE_SIDE ||
			size.height > MAX_IMAGE_SIDE ||
			size.width * size.height > MAX_IMAGE_PIXELS
		) {
			return null;
		}
		return { ...size, dataUrl: dataUrl(mediaType, image.bytes) };
	} catch (error) {
		if (error instanceof LinkPreviewUnavailableError) return null;
		throw error;
	}
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
			if (mediaType) return dataUrl(mediaType, icon.bytes);
		} catch (error) {
			if (!(error instanceof LinkPreviewUnavailableError)) throw error;
		}
	}
	return null;
}

async function loadLinkPreview(
	request: LinkPreviewRequest,
	deps: LinkPreviewDeps,
): Promise<LinkPreview> {
	const page = await fetchResource(
		parseWebUrl(request.url),
		{
			accept: "text/html,application/xhtml+xml;q=0.9",
			maxBytes: MAX_PAGE_BYTES,
			overflow: "truncate",
			stopAtHeadEnd: true,
		},
		deps,
		AbortSignal.timeout(deps.timeoutMs),
	);
	const mediaType = page.contentType?.split(";")[0]?.trim().toLowerCase();
	if (mediaType && !HTML_MEDIA_TYPES.has(mediaType)) return EMPTY_LINK_PREVIEW;
	const html = new TextDecoder().decode(page.bytes);
	const imageHref = request.image ? documentImageHref(html) : null;
	const [iconDataUrl, image] = await Promise.all([
		loadIcon(html, page.url, deps),
		imageHref ? loadImage(imageHref, page.url, deps) : null,
	]);
	return {
		title: documentTitle(html),
		description: documentDescription(html),
		iconDataUrl,
		image,
	};
}

export function createLinkPreviewLoader(
	overrides: Partial<LinkPreviewDeps> = {},
): (request: LinkPreviewRequest) => Promise<LinkPreview> {
	const deps: LinkPreviewDeps = {
		fetch: (url, init) => fetch(url, init),
		lookup: lookupAddresses,
		timeoutMs: REQUEST_TIMEOUT_MS,
		...overrides,
	};
	const pages = new Map<string, Promise<LinkPreview>>();
	const withImages = new Map<string, Promise<LinkPreview>>();
	return ({ url, image }) => {
		const key = url.trim();
		const cache = image ? withImages : pages;
		const cached = cache.get(key);
		if (cached) return cached;
		const pending = loadLinkPreview({ url: key, image }, deps);
		cache.set(key, pending);
		pending.catch(() => {
			if (cache.get(key) === pending) cache.delete(key);
		});
		const oldest = cache.keys().next().value;
		const cap = image ? MAX_CACHED_IMAGE_PREVIEWS : MAX_CACHED_PREVIEWS;
		if (cache.size > cap && oldest !== undefined) cache.delete(oldest);
		return pending;
	};
}
