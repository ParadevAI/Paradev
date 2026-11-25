import { describe, expect, it } from "bun:test";

import { parseOriginList } from "./origin-list";

describe("parseOriginList", () => {
	it("returns each origin of a comma-separated list", () => {
		expect(
			parseOriginList(" https://m.paradev.com, http://localhost:8081/ ,"),
		).toEqual(["https://m.paradev.com", "http://localhost:8081"]);
	});

	it("returns nothing when unset", () => {
		expect(parseOriginList(undefined)).toEqual([]);
	});

	it("rejects wildcards, paths and non-URLs", () => {
		expect(() => parseOriginList("https://*.paradev.com")).toThrow();
		expect(() => parseOriginList("https://m.paradev.com/app")).toThrow();
		expect(() => parseOriginList("m.paradev.com")).toThrow();
	});
});
