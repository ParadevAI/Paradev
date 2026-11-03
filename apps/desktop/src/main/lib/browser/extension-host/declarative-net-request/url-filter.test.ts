import { expect, test } from "bun:test";
import { compileUrlFilter } from "./url-filter";

test("a || anchor matches only in the host, never in userinfo", () => {
	const filter = compileUrlFilter("||example.com^", false);
	expect(filter.test("https://example.com/")).toBe(true);
	expect(filter.test("https://ads.example.com/a.js")).toBe(true);
	expect(filter.test("https://user:pass@example.com/")).toBe(true);
	expect(filter.test("https://example.com@evil.com/")).toBe(false);
	expect(filter.test("https://a.example.com@evil.com/")).toBe(false);
	expect(filter.test("https://notexample.com/")).toBe(false);
});

test("a || anchor skips userinfo that holds more than one @", () => {
	const filter = compileUrlFilter("||example.com^", false);
	expect(filter.test("https://a@b@example.com/")).toBe(true);
	expect(filter.test("https://example.com@b@evil.com/")).toBe(false);
});
