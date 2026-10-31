import { describe, expect, test } from "bun:test";
import { hslToHex } from "./hslToHex";

describe("hslToHex", () => {
	test("converts theme colors", () => {
		expect(hslToHex("hsl(0 0% 100%)")).toBe("#ffffff");
		expect(hslToHex("hsl(0 0% 3.9%)")).toBe("#0a0a0a");
		expect(hslToHex("hsl(0 84.2% 60.2%)")).toBe("#ef4444");
	});

	test("throws on a color it cannot read", () => {
		expect(() => hslToHex("#ffffff")).toThrow();
	});
});
