import { describe, expect, it } from "bun:test";
import { documentIconHrefs, documentTitle } from "./html-metadata";

describe("documentTitle", () => {
	it("prefers og:title, then twitter:title, then the title element", () => {
		const title = "<title>Plain title</title>";
		const twitter = `<meta name="twitter:title" content="Twitter title">`;
		const og = `<meta content="Social &quot;title&quot;" property="og:title">`;
		expect(documentTitle(`<head>${title}${twitter}${og}</head>`)).toBe(
			'Social "title"',
		);
		expect(documentTitle(`<head>${title}${twitter}</head>`)).toBe(
			"Twitter title",
		);
		expect(documentTitle(`<head>${title}</head>`)).toBe("Plain title");
	});

	it("strips tags, decodes entities and collapses whitespace", () => {
		expect(
			documentTitle(
				"<TITLE lang=en>\n  Example <b>docs</b> &amp;&nbsp;API &#8212; v&#x32;\n</TITLE>",
			),
		).toBe("Example docs & API — v2");
	});

	it("decodes HTML named entities in social and document titles", () => {
		const title =
			"Docs &mdash; Example &copy; &hellip; &CounterClockwiseContourIntegral;";
		const expected = "Docs — Example © … ∳";
		expect(documentTitle(`<title>${title}</title>`)).toBe(expected);
		expect(documentTitle(`<meta property="og:title" content="${title}">`)).toBe(
			expected,
		);
	});

	it("skips an empty social title and caps the length", () => {
		const long = "x".repeat(500);
		const html = `<meta property="og:title" content=" "><title>${long}</title>`;
		expect(documentTitle(html)).toBe("x".repeat(240));
	});

	it("is null for a page that names nothing", () => {
		expect(documentTitle("<html><body><p>hello</p></body></html>")).toBeNull();
		expect(documentTitle("<title>  </title>")).toBeNull();
	});
});

describe("documentIconHrefs", () => {
	it("lists icon links in order and leaves out SVG and other rels", () => {
		const html = `
			<link rel="stylesheet" href="/app.css">
			<link rel="icon" type="image/svg+xml" href="/favicon.svg">
			<link rel="mask-icon" href="/mask.svg">
			<link href="/icon-32.png?v=2&amp;s=1" sizes="32x32" rel="shortcut icon">
			<link rel=icon href=/vector.svg?v=1>
			<link rel="ICON" href='/favicon.ico'>
			<link rel="apple-touch-icon" href="/touch.png">
			<link rel="icon" href="">
		`;
		expect(documentIconHrefs(html)).toEqual([
			"/icon-32.png?v=2&s=1",
			"/favicon.ico",
		]);
	});
});
