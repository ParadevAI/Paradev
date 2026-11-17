import { describe, expect, test } from "bun:test";
import { markNamed } from "./plugin-marks.ts";

describe("markNamed", () => {
	test("finds a brand's mark by its slug, and nothing for an unknown one or an Object key", () => {
		expect(markNamed("google-calendar")?.file).toBe("google-calendar");
		expect(markNamed("github")).toEqual({
			file: "github",
			background: "#24292F",
			size: 0.62,
		});
		expect(markNamed("figma")).toBeUndefined();
		expect(markNamed("constructor")).toBeUndefined();
	});
});
