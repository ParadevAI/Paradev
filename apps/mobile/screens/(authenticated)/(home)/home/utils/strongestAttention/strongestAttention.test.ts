import { describe, expect, it } from "bun:test";
import { strongestAttention } from "./strongestAttention";

describe("strongestAttention", () => {
	it("picks the most urgent state", () => {
		expect(strongestAttention(["review", "working", null])).toBe("working");
		expect(strongestAttention(["failed", "permission", "working"])).toBe(
			"permission",
		);
	});

	it("is null when nothing needs attention", () => {
		expect(strongestAttention([null, undefined])).toBeNull();
		expect(strongestAttention([])).toBeNull();
	});
});
