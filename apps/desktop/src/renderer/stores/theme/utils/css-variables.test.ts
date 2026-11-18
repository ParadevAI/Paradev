import { describe, expect, it } from "bun:test";
import { applyThemeCss } from "./css-variables";

const themeStyles = () => document.head.querySelectorAll("style#theme-css");

describe("applyThemeCss", () => {
	it("replaces the previous theme's css and clears it when absent", () => {
		applyThemeCss("body { color: red; }");
		applyThemeCss("body { color: blue; }");
		expect(themeStyles()).toHaveLength(1);
		expect(themeStyles()[0]?.textContent).toBe("body{color:blue}");

		applyThemeCss(undefined);
		expect(themeStyles()).toHaveLength(0);
	});
});

it("validates every application and removes old styles when the new CSS is blocked", () => {
	applyThemeCss("body { color: red }");
	applyThemeCss(
		"body { display: none; background: url(https://example.invalid/track); color:blue }",
	);
	expect(themeStyles()).toHaveLength(1);
	expect(themeStyles()[0]?.textContent).toBe("body{display:none;color:blue}");
	applyThemeCss("body { background:url(https://example.invalid/track) }");
	expect(themeStyles()).toHaveLength(0);
});
