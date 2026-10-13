import { describe, expect, test } from "bun:test";
import { displayHost, findPreviewLink, splitTextLinks } from "./textLinks";

const WEB = "https://app.superset.sh";
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

describe("findPreviewLink", () => {
	const pick = (text: string) => {
		const link = findPreviewLink(splitTextLinks(text), WEB);
		return link?.kind === "link" ? link.url : null;
	};

	test("picks the first link that no pill claims", () => {
		expect(pick(`${PR} then ${DOCS} then https://example.com/later`)).toBe(
			DOCS,
		);
	});

	test("passes over services, files and the app's own links", () => {
		expect(
			pick(
				[
					PR,
					"https://linear.app/superset-sh/issue/SUPER-2608/find",
					"https://acme.slack.com/archives/C1/p2",
					"https://example.com/files/report.pdf",
					`${WEB}/page/links-and-files-bhfk5c`,
					`${WEB}/settings/account`,
				].join(" "),
			),
		).toBeNull();
	});

	test("returns the same part the split produced", () => {
		const parts = splitTextLinks(`${PR} ${DOCS}`);
		expect(findPreviewLink(parts, WEB)).toBe(parts[2] ?? null);
	});
});

test("displayHost names the site without www or a trailing dot", () => {
	expect(displayHost("https://WWW.Example.com./docs")).toBe("example.com");
	expect(displayHost("https://docs.example.com/a")).toBe("docs.example.com");
});
