import { describe, expect, test } from "bun:test";
import { newestBundleSha } from "./current-bundle";

describe("newestBundleSha", () => {
	test("takes the first row, which the query orders newest first", () => {
		expect(newestBundleSha([{ sha: "new" }, { sha: "old" }])).toBe("new");
	});

	test("throws instead of defaulting when no bundle has been released", () => {
		expect(() => newestBundleSha([])).toThrow(/sandbox_bundles is empty/);
	});
});
