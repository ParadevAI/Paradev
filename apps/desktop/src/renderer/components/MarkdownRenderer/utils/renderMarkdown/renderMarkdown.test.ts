import { describe, expect, test } from "bun:test";
import {
	MARKDOWN_CACHE_LIMITS,
	markdownCacheSize,
	renderMarkdown,
} from "./renderMarkdown";

const components = {};

describe("renderMarkdown", () => {
	test("returns the cached elements for the same content", () => {
		const first = renderMarkdown({
			content: "# Title\n\nbody",
			allowHtml: true,
			components,
		});
		const second = renderMarkdown({
			content: "# Title\n\nbody",
			allowHtml: true,
			components,
		});
		expect(second).toBe(first);
	});

	test("parses again for other components or HTML handling", () => {
		const base = renderMarkdown({ content: "x", allowHtml: true, components });
		expect(
			renderMarkdown({ content: "x", allowHtml: false, components }),
		).not.toBe(base);
		expect(
			renderMarkdown({ content: "x", allowHtml: true, components: {} }),
		).not.toBe(base);
	});

	test("does not cache content past the size limit", () => {
		const content = "a".repeat(MARKDOWN_CACHE_LIMITS.contentLength + 1);
		const first = renderMarkdown({ content, allowHtml: false, components });
		expect(renderMarkdown({ content, allowHtml: false, components })).not.toBe(
			first,
		);
	});

	test("stays bounded and evicts the least recently used", () => {
		const kept = renderMarkdown({
			content: "kept",
			allowHtml: true,
			components,
		});
		const firstDoc = renderMarkdown({
			content: "doc 0",
			allowHtml: true,
			components,
		});
		for (let i = 1; i < MARKDOWN_CACHE_LIMITS.entries * 2; i++) {
			renderMarkdown({ content: `doc ${i}`, allowHtml: true, components });
			if (i % 8 === 0) {
				renderMarkdown({ content: "kept", allowHtml: true, components });
			}
		}
		expect(markdownCacheSize()).toBeLessThanOrEqual(
			MARKDOWN_CACHE_LIMITS.entries,
		);
		expect(
			renderMarkdown({ content: "kept", allowHtml: true, components }),
		).toBe(kept);
		expect(
			renderMarkdown({ content: "doc 0", allowHtml: true, components }),
		).not.toBe(firstDoc);
	});

	test("stays within the total content budget", () => {
		const size = MARKDOWN_CACHE_LIMITS.contentLength;
		const count =
			Math.ceil(MARKDOWN_CACHE_LIMITS.totalContentLength / size) + 2;
		for (let i = 0; i < count; i++) {
			renderMarkdown({
				content: `${i}`.padEnd(size, "b"),
				allowHtml: false,
				components,
			});
		}
		expect(markdownCacheSize()).toBeLessThanOrEqual(
			MARKDOWN_CACHE_LIMITS.totalContentLength / size,
		);
	});
});
