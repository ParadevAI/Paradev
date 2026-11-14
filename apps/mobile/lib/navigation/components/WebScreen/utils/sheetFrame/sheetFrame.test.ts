import { describe, expect, test } from "bun:test";
import { sheetFrame } from "./sheetFrame";

describe("sheetFrame", () => {
	test("a wide window gets a centred dialog sized by the detent", () => {
		expect(sheetFrame({ width: 1440, height: 900 }, [0.5])).toEqual({
			kind: "dialog",
			width: 560,
			height: 450,
		});
	});

	test("a full-height dialog stops short of the window", () => {
		expect(sheetFrame({ width: 1440, height: 900 }, [0.6, 1.0])).toEqual({
			kind: "dialog",
			width: 560,
			height: 720,
		});
	});

	test("a narrow window gets a bottom sheet across its width", () => {
		expect(sheetFrame({ width: 390, height: 844 }, [0.5])).toEqual({
			kind: "bottom",
			width: 390,
			height: 422,
		});
		expect(sheetFrame({ width: 390, height: 844 }, [1.0]).height).toBe(796);
	});
});
