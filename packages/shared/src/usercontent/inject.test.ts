import { describe, expect, test } from "bun:test";
import {
	documentEtag,
	injectHeadScriptTag,
	injectScriptTag,
	injectStyleTag,
	isRuntimeScriptPath,
	RUNTIME_SCRIPT_PATH,
	STORAGE_SCRIPT_PATH,
	storageScriptPath,
	TOOLS_SCRIPT_PATH,
	toolsScriptPath,
} from "./inject";

const CSS = "body{color:red}";
const LINK = `<style>${CSS}</style>`;

describe("injectStyleTag", () => {
	test("opens the head with the link", () => {
		expect(
			injectStyleTag("<html><head><title>x</title></head></html>", CSS),
		).toBe(`<html><head>${LINK}<title>x</title></head></html>`);
	});

	test("stays ahead of the page's own styles", () => {
		const html = "<head><style>body{background:#fff}</style></head>";
		const out = injectStyleTag(html, CSS);
		expect(out.indexOf(LINK)).toBeLessThan(
			out.indexOf("body{background:#fff}"),
		);
	});

	test("keeps attributes on the head tag", () => {
		expect(injectStyleTag('<head lang="en">x</head>', CSS)).toBe(
			`<head lang="en">${LINK}x</head>`,
		);
	});

	test("follows the doctype when there is no head", () => {
		expect(injectStyleTag("<!DOCTYPE html><p>hi</p>", CSS)).toBe(
			`<!DOCTYPE html>${LINK}<p>hi</p>`,
		);
	});

	test("is not fooled by a <header> element", () => {
		const html = "<header><style>p{color:red}</style></header>";
		expect(injectStyleTag(html, CSS)).toBe(`${LINK}${html}`);
	});

	test("follows a doctype that trails a newline", () => {
		expect(injectStyleTag("\n<!doctype html><p>hi</p>", CSS)).toBe(
			`\n<!doctype html>${LINK}<p>hi</p>`,
		);
	});

	test("goes first in a fragment", () => {
		expect(injectStyleTag("<p>hi</p>", CSS)).toBe(`${LINK}<p>hi</p>`);
	});

	test("skips a head written inside a comment", () => {
		const html = "<!-- <head> is where styles go --><head><p>hi</p></head>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<!-- <head> is where styles go --><head>${LINK}<p>hi</p></head>`,
		);
	});

	test("skips a head written inside a script", () => {
		const html = '<script>d.write("<head>")</script><head lang="en">x</head>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<script>d.write("<head>")</script><head lang="en">${LINK}x</head>`,
		);
	});

	test("skips a head written inside a style", () => {
		const html = "<style>/* <head> */</style><head>x</head>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<style>/* <head> */</style><head>${LINK}x</head>`,
		);
	});

	test("reads past a > inside a quoted head attribute", () => {
		const html = '<head data-value=">"><p>hi</p></head>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<head data-value=">">${LINK}<p>hi</p></head>`,
		);
	});

	test("falls back when the only head is inside a comment", () => {
		const html = "<!DOCTYPE html><!-- <head> --><p>hi</p>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<!DOCTYPE html>${LINK}<!-- <head> --><p>hi</p>`,
		);
	});

	test("skips a head written inside another element's attribute", () => {
		const html =
			'<div data-hint="write your styles in <head>"></div><head>x</head>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<div data-hint="write your styles in <head>"></div><head>${LINK}x</head>`,
		);
	});

	test("falls back when the only head is inside an attribute", () => {
		const html = '<!DOCTYPE html><div title="a <head> tag">hi</div>';
		expect(injectStyleTag(html, CSS)).toBe(
			`<!DOCTYPE html>${LINK}<div title="a <head> tag">hi</div>`,
		);
	});

	test("does not mistake header for head", () => {
		const html = "<header>top</header><head>x</head>";
		expect(injectStyleTag(html, CSS)).toBe(
			`<header>top</header><head>${LINK}x</head>`,
		);
	});

	test("scans a document with many script blocks and no head", () => {
		const html = `<!DOCTYPE html>${"<script>var a = 1;</script>".repeat(2000)}<p>hi</p>`;
		expect(injectStyleTag(html, CSS)).toBe(
			`<!DOCTYPE html>${LINK}${"<script>var a = 1;</script>".repeat(2000)}<p>hi</p>`,
		);
	});
});

describe("injectScriptTag", () => {
	test("closes the body with the script", () => {
		expect(injectScriptTag("<body><p>hi</p></body>", "/r.js")).toBe(
			'<body><p>hi</p><script src="/r.js"></script></body>',
		);
	});

	test("appends when there is no body", () => {
		expect(injectScriptTag("<p>hi</p>", "/r.js")).toBe(
			'<p>hi</p><script src="/r.js"></script>',
		);
	});
});

describe("injectHeadScriptTag", () => {
	test("lands before a script the author wrote in the body", () => {
		const html = `<!doctype html><html><head><title>t</title></head><body><script>init()</script></body></html>`;
		const out = injectHeadScriptTag(html, STORAGE_SCRIPT_PATH);
		expect(out.indexOf(STORAGE_SCRIPT_PATH)).toBeLessThan(
			out.indexOf("init()"),
		);
	});

	test("goes inside head, not before it", () => {
		const out = injectHeadScriptTag(
			`<!doctype html><html><head></head><body></body></html>`,
			STORAGE_SCRIPT_PATH,
		);
		expect(out).toContain(
			`<head><script src="${STORAGE_SCRIPT_PATH}"></script></head>`,
		);
	});

	test("still beats author script when the document has no head", () => {
		const out = injectHeadScriptTag(
			`<!doctype html><body><script>init()</script></body>`,
			STORAGE_SCRIPT_PATH,
		);
		expect(out.indexOf(STORAGE_SCRIPT_PATH)).toBeLessThan(
			out.indexOf("init()"),
		);
	});

	test("the two runtimes land on opposite sides of the document", () => {
		const html = `<!doctype html><html><head></head><body><p>x</p></body></html>`;
		const out = injectHeadScriptTag(
			injectScriptTag(html, RUNTIME_SCRIPT_PATH),
			STORAGE_SCRIPT_PATH,
		);
		expect(out.indexOf(STORAGE_SCRIPT_PATH)).toBeLessThan(
			out.indexOf(RUNTIME_SCRIPT_PATH),
		);
	});
});

describe("storageScriptPath", () => {
	test("moves when the runtime source changes, and only then", () => {
		const path = storageScriptPath("runtime v1");
		expect(path).toMatch(/^\/_superset\/storage\.[0-9a-z]+\.js$/);
		expect(storageScriptPath("runtime v1")).toBe(path);
		expect(storageScriptPath("runtime v2")).not.toBe(path);
		expect(path).not.toBe(STORAGE_SCRIPT_PATH);
	});
});

describe("toolsScriptPath", () => {
	test("moves when the runtime source changes, and only then", () => {
		const path = toolsScriptPath("runtime v1");
		expect(path).toMatch(/^\/_superset\/tools\.[0-9a-z]+\.js$/);
		expect(toolsScriptPath("runtime v1")).toBe(path);
		expect(toolsScriptPath("runtime v2")).not.toBe(path);
		expect(path).not.toBe(TOOLS_SCRIPT_PATH);
	});
});

describe("isRuntimeScriptPath", () => {
	test("matches the fixed path and any revision, not only the current one", () => {
		expect(isRuntimeScriptPath(STORAGE_SCRIPT_PATH, "storage")).toBe(true);
		expect(isRuntimeScriptPath(storageScriptPath("old"), "storage")).toBe(true);
		expect(isRuntimeScriptPath(storageScriptPath("new"), "storage")).toBe(true);
		expect(isRuntimeScriptPath(TOOLS_SCRIPT_PATH, "tools")).toBe(true);
		expect(isRuntimeScriptPath(toolsScriptPath("old"), "tools")).toBe(true);
	});

	test("does not match other scripts or other files", () => {
		expect(isRuntimeScriptPath(toolsScriptPath("old"), "storage")).toBe(false);
		expect(isRuntimeScriptPath(RUNTIME_SCRIPT_PATH, "storage")).toBe(false);
		expect(isRuntimeScriptPath("/_superset/storage.x.y.js", "storage")).toBe(
			false,
		);
		expect(isRuntimeScriptPath("/_superset/storage.css", "storage")).toBe(
			false,
		);
		expect(
			isRuntimeScriptPath("/versions/2/_superset/storage.js", "storage"),
		).toBe(false);
	});
});

describe("documentEtag", () => {
	test("moves with the version, the policy, and the render revision", () => {
		const tag = documentEtag(3, "policy", "rev1");
		expect(tag).toMatch(/^W\/"3\./);
		expect(documentEtag(3, "policy", "rev1")).toBe(tag);
		expect(documentEtag(4, "policy", "rev1")).not.toBe(tag);
		expect(documentEtag(3, "other policy", "rev1")).not.toBe(tag);
		expect(documentEtag(3, "policy", "rev2")).not.toBe(tag);
	});
});
