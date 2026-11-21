import { describe, expect, test } from "bun:test";
import { getConnector } from "./index";

describe("getConnector", () => {
	test("finds a registered connector", () => {
		expect(getConnector("ahrefs_mcp")?.displayName).toBe("Ahrefs");
	});

	test("does not match inherited object keys", () => {
		for (const slug of ["constructor", "__proto__", "toString"])
			expect(getConnector(slug)).toBeUndefined();
	});
});
