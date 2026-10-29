/**
 * An HTML fence from a chat reply renders in a frame served from this scheme.
 * The main process answers it with the document and `HTML_PREVIEW_CSP` as a
 * header, so the page runs its own inline scripts and reaches nothing else.
 * A frame with a local URL (srcdoc, data:, blob:) would inherit the app's
 * policy instead, which has no 'unsafe-inline' for scripts.
 */
export const HTML_PREVIEW_SCHEME = "superset-preview";
export const HTML_PREVIEW_HOST = "document";
export const HTML_PREVIEW_PARAM = "d";
export const HTML_PREVIEW_MAX_BYTES = 1024 * 1024;

/** Inline scripts and styles run; no network, no forms, no base override. */
export const HTML_PREVIEW_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	"img-src data:",
	"font-src data:",
	"media-src data:",
	"form-action 'none'",
	"base-uri 'none'",
].join("; ");

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	let binary: string;
	try {
		binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
	} catch {
		return null;
	}
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

/** The URL a frame loads to show `document`; the document travels in the URL. */
export function htmlPreviewUrl(document: string): string {
	const encoded = base64Url(new TextEncoder().encode(document));
	return `${HTML_PREVIEW_SCHEME}://${HTML_PREVIEW_HOST}/?${HTML_PREVIEW_PARAM}=${encoded}`;
}

export type HtmlPreviewRequest =
	| { status: "ok"; document: Uint8Array<ArrayBuffer> }
	| { status: "not-found" }
	| { status: "too-large" };

/** The document a preview URL carries, or why it cannot be served. */
export function readHtmlPreviewUrl(url: string): HtmlPreviewRequest {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { status: "not-found" };
	}
	const encoded = parsed.searchParams.get(HTML_PREVIEW_PARAM);
	if (
		parsed.protocol !== `${HTML_PREVIEW_SCHEME}:` ||
		parsed.host !== HTML_PREVIEW_HOST ||
		parsed.pathname !== "/" ||
		encoded === null
	) {
		return { status: "not-found" };
	}
	if (encoded.length > (HTML_PREVIEW_MAX_BYTES * 4) / 3 + 4) {
		return { status: "too-large" };
	}
	const document = fromBase64Url(encoded);
	if (!document) return { status: "not-found" };
	if (document.byteLength > HTML_PREVIEW_MAX_BYTES)
		return { status: "too-large" };
	return { status: "ok", document };
}
