/**
 * What a browser may do with a served file, decided from the server-sniffed
 * content type — never the client's declaration — and how the browser asked
 * (`Sec-Fetch-Dest`). The policy is deliberately blunt: anything that could
 * script on the media origin downloads instead of rendering, SVG renders
 * only as a subresource image, and every response carries `nosniff` and a
 * sandbox CSP as the second wall.
 */
export interface FileResponsePolicy {
	contentType: string;
	disposition: "inline" | "attachment";
}

const SCRIPTABLE = new Set([
	"text/html",
	"application/xhtml+xml",
	"text/xml",
	"application/xml",
]);

const INLINE_PREFIXES = ["image/", "video/", "audio/", "font/"];

const INLINE_TYPES = new Set([
	"application/pdf",
	"application/json",
	"text/plain",
	"text/csv",
	"text/markdown",
]);

export const FILE_CONTENT_SECURITY_POLICY = "sandbox; default-src 'none'";

export function fileResponsePolicy({
	contentType,
	fetchDest,
}: {
	contentType: string;
	fetchDest: string | undefined;
}): FileResponsePolicy {
	const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();

	if (SCRIPTABLE.has(type)) {
		return { contentType: type, disposition: "attachment" };
	}
	if (type === "image/svg+xml") {
		// Renders in an <img>, downloads when navigated to: an SVG is a
		// document with script the moment it is the top-level resource.
		return {
			contentType: type,
			disposition: fetchDest === "image" ? "inline" : "attachment",
		};
	}
	if (
		INLINE_TYPES.has(type) ||
		INLINE_PREFIXES.some((prefix) => type.startsWith(prefix))
	) {
		return { contentType: type, disposition: "inline" };
	}
	return {
		contentType: type || "application/octet-stream",
		disposition: "attachment",
	};
}
