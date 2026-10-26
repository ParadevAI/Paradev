import { describe, expect, test } from "bun:test";
import { isRtlRow } from "./rtlRow";

describe("isRtlRow", () => {
	test("Hebrew row", () => {
		expect(isRtlRow("שלום עולם")).toBe(true);
	});

	test("Arabic row", () => {
		expect(isRtlRow("مرحبا بالعالم")).toBe(true);
	});

	test("leading symbols and digits do not decide", () => {
		expect(isRtlRow("⏺ 3. עדכנתי את הקובץ")).toBe(true);
		expect(isRtlRow("  │ 42 ")).toBe(false);
	});

	test("first strong character wins", () => {
		expect(isRtlRow("Edited file.ts — תיקון")).toBe(false);
		expect(isRtlRow("תיקון ב-file.ts")).toBe(true);
	});

	test("blank and ASCII rows", () => {
		expect(isRtlRow("")).toBe(false);
		expect(isRtlRow("$ ls -la")).toBe(false);
	});

	test("survives being inlined as source", () => {
		const inlined = new Function(`return ${isRtlRow.toString()}`)();
		expect(inlined("שלום")).toBe(true);
		expect(inlined("hello")).toBe(false);
	});
});
