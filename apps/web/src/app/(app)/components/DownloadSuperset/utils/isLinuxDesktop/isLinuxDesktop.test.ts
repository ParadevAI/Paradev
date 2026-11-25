import { expect, test } from "bun:test";
import { isLinuxDesktop } from "./isLinuxDesktop";

test.each([
	["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0", true],
	["Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Firefox/145.0", true],
	["Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/142.0 Mobile", false],
	["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", false],
	["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0", false],
	[null, false],
])("%s: %p", (userAgent, expected) => {
	expect(isLinuxDesktop(userAgent)).toBe(expected);
});
