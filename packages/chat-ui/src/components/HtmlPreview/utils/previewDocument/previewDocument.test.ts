import { describe, expect, test } from "bun:test";
import { HTML_PREVIEW_CSP } from "@superset/shared/html-preview";
import {
	isPreviewEscape,
	PREVIEW_ESCAPE_MESSAGE,
	PREVIEW_SANDBOX,
	PREVIEW_SIZE_MESSAGE,
	previewDocument,
	readPreviewSize,
} from "./previewDocument";

describe("previewDocument", () => {
	test("puts the policy ahead of the fence's markup and reports its size", () => {
		const document = previewDocument("<h1>Hi</h1><script>go()</script>");
		const policyAt = document.indexOf(
			`<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">`,
		);
		expect(policyAt).toBeGreaterThan(-1);
		expect(policyAt).toBeLessThan(document.indexOf("<h1>Hi</h1>"));
		expect(document).toContain(`"${PREVIEW_SIZE_MESSAGE}"`);
		expect(document).toContain(`"${PREVIEW_ESCAPE_MESSAGE}"`);
		expect(PREVIEW_SANDBOX).toBe("allow-scripts");
	});
});

describe("isPreviewEscape", () => {
	test("accepts only the page's Escape report", () => {
		expect(isPreviewEscape({ type: PREVIEW_ESCAPE_MESSAGE })).toBe(true);
		expect(
			isPreviewEscape({ type: PREVIEW_SIZE_MESSAGE, width: 0, height: 1 }),
		).toBe(false);
		expect(isPreviewEscape("Escape")).toBe(false);
	});
});

describe("readPreviewSize", () => {
	test("accepts only the page's size report, rounded up and bounded", () => {
		expect(
			readPreviewSize({
				type: PREVIEW_SIZE_MESSAGE,
				width: 640.2,
				height: 1e9,
			}),
		).toEqual({ width: 641, height: 20_000 });
		expect(
			readPreviewSize({ type: PREVIEW_SIZE_MESSAGE, width: 0, height: 120 }),
		).toEqual({ width: 0, height: 120 });
		expect(readPreviewSize({ type: "other", width: 1, height: 1 })).toBeNull();
		expect(
			readPreviewSize({ type: PREVIEW_SIZE_MESSAGE, width: "640", height: 1 }),
		).toBeNull();
		expect(readPreviewSize("resize")).toBeNull();
	});
});
