import { describe, expect, test } from "bun:test";
import { splitTextLinks } from "./textLinks";

const PR = "https://github.com/superset-sh/superset/pull/8329";
const DOCS = "https://agentclientprotocol.com/protocol/content";

describe("splitTextLinks", () => {
	test("keeps every character of the text around its links", () => {
		const text = `Can you look at ${PR} and compare\nwith ${DOCS}`;
		const parts = splitTextLinks(text);
		expect(parts).toEqual([
			{ kind: "text", text: "Can you look at " },
			{ kind: "link", url: PR },
			{ kind: "text", text: " and compare\nwith " },
			{ kind: "link", url: DOCS },
		]);
		expect(
			parts
				.map((part) => (part.kind === "text" ? part.text : part.url))
				.join(""),
		).toBe(text);
	});

	test("leaves sentence punctuation and closing brackets outside the link", () => {
		expect(splitTextLinks("See (https://example.com/docs), thanks.")).toEqual([
			{ kind: "text", text: "See (" },
			{ kind: "link", url: "https://example.com/docs" },
			{ kind: "text", text: "), thanks." },
		]);
		expect(splitTextLinks("Is it https://example.com/a_(b)?")).toEqual([
			{ kind: "text", text: "Is it " },
			{ kind: "link", url: "https://example.com/a_(b)" },
			{ kind: "text", text: "?" },
		]);
	});

	test("text without a usable web URL stays one run", () => {
		for (const text of [
			"nothing to link here",
			"mailto:a@b.co and ftp://example.com/file",
			"https://user:secret@example.com/private",
			"https://",
		]) {
			expect(splitTextLinks(text)).toEqual([{ kind: "text", text }]);
		}
		expect(splitTextLinks("")).toEqual([]);
	});
});
