import { describe, expect, test } from "bun:test";
import {
	HTML_PREVIEW_CSP,
	HTML_PREVIEW_MAX_BYTES,
	htmlPreviewUrl,
} from "@superset/shared/html-preview";
import {
	htmlPreviewProtocolHandler,
	leavesHtmlPreview,
} from "./html-preview-protocol";

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

describe("leavesHtmlPreview", () => {
	test("stops a preview frame going anywhere but another preview document", () => {
		const preview = htmlPreviewUrl("<p>hi</p>");
		expect(leavesHtmlPreview(preview, "https://example.com/?leak=1")).toBe(
			true,
		);
		expect(leavesHtmlPreview(preview, "about:blank")).toBe(true);
		expect(leavesHtmlPreview(preview, htmlPreviewUrl("<p>next</p>"))).toBe(
			false,
		);
		expect(leavesHtmlPreview("about:blank", preview)).toBe(false);
		expect(
			leavesHtmlPreview("http://localhost:9185/", "https://example.com/"),
		).toBe(false);
	});
});
