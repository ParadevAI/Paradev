import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	HTML_PREVIEW_CSP,
	HTML_PREVIEW_SCHEME,
	readHtmlPreviewUrl,
} from "@superset/shared/html-preview";

const DOCUMENT_HEADERS = {
	"Content-Type": "text/html; charset=utf-8",
	"Content-Security-Policy": HTML_PREVIEW_CSP,
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "no-store",
};

/**
 * Serves a chat reply's HTML fence from its own origin, with the policy as a
 * header, so the renderer's own policy is not what the frame inherits.
 */
export function htmlPreviewProtocolHandler(request: Request): Response {
	const read = readHtmlPreviewUrl(request.url);
	if (read.status === "ok") {
		return new Response(read.document, {
			status: 200,
			headers: DOCUMENT_HEADERS,
		});
	}
	if (read.status === "too-large") {
		return new Response(
			i18n._(msg({ message: "This preview is too large to show." })),
			{
				status: 413,
				headers: {
					...DOCUMENT_HEADERS,
					"Content-Type": "text/plain; charset=utf-8",
				},
			},
		);
	}
	return new Response("Not found", { status: 404 });
}

const isHtmlPreviewUrl = (url: string) =>
	url.startsWith(`${HTML_PREVIEW_SCHEME}:`);

/**
 * A preview page may move only to another preview document. Its policy stops
 * every fetch, but not a navigation of its own frame, which would load a remote
 * page inside the chat with the preview's data in the URL.
 */
export function leavesHtmlPreview(
	frameUrl: string,
	targetUrl: string,
): boolean {
	return isHtmlPreviewUrl(frameUrl) && !isHtmlPreviewUrl(targetUrl);
}
