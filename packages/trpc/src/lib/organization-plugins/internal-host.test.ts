import { describe, expect, test } from "bun:test";
import { isInternalUrl } from "./internal-host";

describe("isInternalUrl", () => {
	test("public hosts pass", () => {
		expect(isInternalUrl("https://tools.example.com/mcp")).toBe(false);
		expect(isInternalUrl("https://8.8.8.8/mcp")).toBe(false);
	});

	test("an address a template resolved to is checked too", () => {
		expect(isInternalUrl("https://127.1/mcp")).toBe(true);
		expect(isInternalUrl("https://0x7f000001/mcp")).toBe(true);
		expect(isInternalUrl("not a url")).toBe(true);
	});
});
