import { describe, expect, it } from "bun:test";
import { selectRange } from "./selectRange";

const order = ["a", "b", "c", "d"];

describe("selectRange", () => {
	it("covers anchor to target in either direction", () => {
		expect(selectRange(order, "b", "d")).toEqual(["b", "c", "d"]);
		expect(selectRange(order, "d", "b")).toEqual(["b", "c", "d"]);
	});

	it("falls back to the target when the anchor is not shown", () => {
		expect(selectRange(order, "gone", "c")).toEqual(["c"]);
		expect(selectRange(order, null, "c")).toEqual(["c"]);
	});
});
