import { describe, expect, it } from "bun:test";
import { applyThemeCss } from "./css-variables";

const themeStyles = () => document.head.querySelectorAll("style#theme-css");

describe("applyThemeCss", () => {
	it("replaces the previous theme's css and clears it when absent", () => {
		applyThemeCss("body { color: red; }");
		applyThemeCss("body { color: blue; }");
		expect(themeStyles()).toHaveLength(1);
		expect(themeStyles()[0]?.textContent).toBe("body { color: blue; }");

		applyThemeCss(undefined);
		expect(themeStyles()).toHaveLength(0);
	});
});
