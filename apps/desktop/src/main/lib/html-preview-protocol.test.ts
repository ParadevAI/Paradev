import { describe, expect, test } from "bun:test";
import {
	HTML_PREVIEW_CSP,
	HTML_PREVIEW_MAX_BYTES,
	htmlPreviewUrl,
} from "@superset/shared/html-preview";
import { htmlPreviewProtocolHandler } from "./html-preview-protocol";

describe("htmlPreviewProtocolHandler", () => {
	test("serves the document with the preview policy as a header", async () => {
		const response = htmlPreviewProtocolHandler(
			new Request(htmlPreviewUrl("<p>hi</p>")),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-security-policy")).toBe(
			HTML_PREVIEW_CSP,
		);
		expect(response.headers.get("content-type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(await response.text()).toBe("<p>hi</p>");
	});

	test("refuses anything that is not a preview document", () => {
		expect(
			htmlPreviewProtocolHandler(
				new Request("superset-preview://document/secret"),
			).status,
		).toBe(404);
		expect(
			htmlPreviewProtocolHandler(
				new Request(htmlPreviewUrl("x".repeat(HTML_PREVIEW_MAX_BYTES + 1))),
			).status,
		).toBe(413);
	});
});
