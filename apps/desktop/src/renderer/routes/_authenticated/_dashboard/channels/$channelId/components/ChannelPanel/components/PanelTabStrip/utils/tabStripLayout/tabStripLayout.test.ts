import { expect, test } from "bun:test";
import { tabStripLayout } from "./tabStripLayout";

test("tabs share the strip between 90 and 240px, then the strip scrolls", () => {
	expect(tabStripLayout(600, 2)).toEqual({ tabWidth: 240, scrolls: false });
	expect(tabStripLayout(600, 4)).toEqual({ tabWidth: 150, scrolls: false });
	expect(tabStripLayout(600, 10)).toEqual({ tabWidth: 90, scrolls: true });
	expect(tabStripLayout(null, 3)).toEqual({ tabWidth: 240, scrolls: false });
});
