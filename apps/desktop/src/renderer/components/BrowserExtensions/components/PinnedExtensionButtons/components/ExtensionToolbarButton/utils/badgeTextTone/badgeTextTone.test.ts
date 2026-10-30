import { expect, test } from "bun:test";
import { badgeTextTone } from "./badgeTextTone";

test("badge text is light on dark colors and dark on light colors", () => {
	expect(badgeTextTone([139, 0, 0, 255])).toBe("light");
	expect(badgeTextTone([255, 214, 0, 255])).toBe("dark");
});
