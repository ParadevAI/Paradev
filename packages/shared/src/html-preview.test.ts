import { describe, expect, test } from "bun:test";
import {
	HTML_PREVIEW_CSP,
	HTML_PREVIEW_MAX_BYTES,
	htmlPreviewUrl,
	readHtmlPreviewUrl,
} from "./html-preview";

describe("html preview URLs", () => {
	test("carry the document, unicode included, and read it back", () => {
		const document = "<!doctype html><p>héllo — ✓ </p>";
		const read = readHtmlPreviewUrl(htmlPreviewUrl(document));
		expect(read.status).toBe("ok");
		if (read.status === "ok") {
			expect(new TextDecoder().decode(read.document)).toBe(document);
		}
	});

	test("refuse other hosts, paths, payloads and oversize documents", () => {
		expect(readHtmlPreviewUrl("superset-preview://other/?d=PGI-")).toEqual({
			status: "not-found",
		});
		expect(readHtmlPreviewUrl("superset-preview://document/x?d=PGI-")).toEqual({
			status: "not-found",
		});
		expect(readHtmlPreviewUrl("superset-preview://document/?d=%%%")).toEqual({
			status: "not-found",
		});
		expect(readHtmlPreviewUrl("superset-preview://document/?d=A")).toEqual({
			status: "not-found",
		});
		expect(readHtmlPreviewUrl("not a url")).toEqual({ status: "not-found" });
		expect(
			readHtmlPreviewUrl(
				htmlPreviewUrl("x".repeat(HTML_PREVIEW_MAX_BYTES + 1)),
			),
		).toEqual({ status: "too-large" });
	});

	test("the policy allows inline code only and no network at all", () => {
		expect(HTML_PREVIEW_CSP).toContain("default-src 'none'");
		expect(HTML_PREVIEW_CSP).toContain("script-src 'unsafe-inline'");
		expect(HTML_PREVIEW_CSP).not.toMatch(/https?:|\*|'self'/);
	});
});
