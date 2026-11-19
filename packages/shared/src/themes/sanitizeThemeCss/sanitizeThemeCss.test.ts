import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_THEME_CSS_LENGTH, sanitizeThemeCss } from "./sanitizeThemeCss";

describe("sanitizeThemeCss", () => {
	it("preserves supported colors, gradients and embedded raster images", () => {
		const css =
			'body { color: oklch(0.9 0.1 20); background: linear-gradient(red, blue) !important; } .art { background-image: url("data:image/png;base64,AA=="); }';
		const output = sanitizeThemeCss(css);
		expect(output).toContain("oklch(0.9 0.1 20)");
		expect(output).toContain("linear-gradient(red,blue)!important");
		expect(output).toContain("data:image/png;base64,AA==");
		expect(sanitizeThemeCss(output)).toBe(output);
	});

	it.each([
		"background: url(https://example.invalid/track)",
		"background: url(http://127.0.0.1:9999/track)",
		"background: url(file:///etc/passwd)",
		"background: url(/track)",
		String.raw`background: u\72l("https://example.invalid/track")`,
		'background: image-set("https://example.invalid/track" 1x)',
		'background: -webkit-image-set("https://example.invalid/track" 1x)',

		"background: attr(data-secret)",
		'background: url("data:image/svg+xml,<svg/>")',
		"--background: url(https://example.invalid/track)",
		"behavior: expression(alert(1))",
		"-moz-binding: url(https://example.invalid/code)",
		'background: src("https://example.invalid/track")',
	])("removes unsafe declarations: %s", (declaration) => {
		expect(sanitizeThemeCss(`body { ${declaration}; color: red; }`)).toBe(
			"body{color:red}",
		);
	});

	it("preserves layout, generated content, animation, nesting and selectors", () => {
		const css =
			'@media all{body{display:none}}@keyframes pulse{to{opacity:0}}body{& button{position:fixed}animation:pulse 1s infinite}button::before{content:"OK"}body:has([value^="secret"]){color:red}';
		expect(sanitizeThemeCss(css)).toBe(css);
	});

	it("isolates custom properties from app CSS and preserves theme references", () => {
		const css =
			'@property --angle{syntax:"<angle>";inherits:false;initial-value:0deg}:root{--angle:20deg;--image:"https://example.invalid/track"}body{transform:rotate(var(--angle));background:image-set(var(--image) 1x)}';
		const output = sanitizeThemeCss(css);
		expect(output).toContain("@property --paradev-theme-angle");
		expect(output).toContain("rotate(var(--paradev-theme-angle))");
		expect(output).not.toContain("image-set");
		expect(output).not.toContain("{--angle:");
		expect(sanitizeThemeCss(output)).toBe(output);
	});

	it("keeps escaped custom property names as identifiers", () => {
		const output = sanitizeThemeCss(
			String.raw`body{--x\3b background:red;color:var(--x\3b background)}`,
		);
		expect(output).toContain(String.raw`--paradev-theme-x\;background`);
		expect(sanitizeThemeCss(output)).toBe(output);
	});

	it("blocks resource loading inside nested rules and font faces", () => {
		const css =
			'@import "https://example.invalid/a.css";@font-face{font-family:x;src:url(https://example.invalid/font)}@media all{body{& button{background:url(/track)}color:red}}';
		expect(sanitizeThemeCss(css)).toBe(
			"@font-face{font-family:x}@media all{body{color:red}}",
		);
	});

	it("fails closed on malformed or oversized CSS", () => {
		expect(sanitizeThemeCss("body { color: red; broken }")).toBe("");
		expect(sanitizeThemeCss(" ".repeat(MAX_THEME_CSS_LENGTH + 1))).toBe("");
		expect(sanitizeThemeCss(undefined)).toBe("");
	});
});

it("bounds stylesheet complexity", () => {
	expect(sanitizeThemeCss("a{color:red}".repeat(3000))).toBe("");
});

it("preserves empty layers that establish cascade order", () => {
	const css =
		"@layer first{}@layer second{a{color:red}}@layer first{a{color:blue}}";
	expect(sanitizeThemeCss(css)).toBe(css);
});

it("bounds output expanded by custom property namespacing", () => {
	const css = `a{${Array.from({ length: 3000 }, (_, i) => `--x${i.toString().padStart(4, "0")}:0;`).join("")}}`;
	expect(css.length).toBeLessThan(MAX_THEME_CSS_LENGTH);
	const output = sanitizeThemeCss(css);
	expect(output).toBe("");
	expect(sanitizeThemeCss(output)).toBe(output);
});

it("runs from a Bun bundle, as in the compiled CLI", async () => {
	const outdir = await mkdtemp(join(tmpdir(), "sanitize-theme-css-"));
	try {
		const build = await Bun.build({
			entrypoints: [join(import.meta.dir, "sanitizeThemeCss.ts")],
			target: "bun",
			outdir,
		});
		expect(build.success).toBe(true);
		const bundled = await import(join(outdir, "sanitizeThemeCss.js"));
		expect(bundled.sanitizeThemeCss("a { color: red; }")).toBe("a{color:red}");
	} finally {
		await rm(outdir, { recursive: true, force: true });
	}
});
