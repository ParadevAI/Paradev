import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	HTML_PREVIEW_CSP,
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
