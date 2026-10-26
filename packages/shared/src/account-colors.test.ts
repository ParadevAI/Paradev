import { expect, test } from "bun:test";
import {
	ACCOUNT_COLORS,
	accountColor,
	isAccountColor,
	parseCustomAccountColor,
} from "./account-colors";

test("existing presets retain their theme colors", () => {
	for (const preset of ACCOUNT_COLORS) {
		expect(isAccountColor(preset)).toBe(true);
		expect(accountColor(preset, false)).toBeDefined();
		expect(accountColor(preset, true)).toBeDefined();
	}
	expect(accountColor("green", false)).toBe("#15803d");
	expect(accountColor("green", true)).toBe("#4ade80");
	expect(accountColor(null, false)).toBeUndefined();
	expect(accountColor(undefined, true)).toBeUndefined();
});

test("opaque six-digit custom colors render unchanged in both themes", () => {
	for (const color of ["#000000", "#ffffff", "#Ab12Cd"]) {
		expect(isAccountColor(color)).toBe(true);
		expect(accountColor(color, false)).toBe(color);
		expect(accountColor(color, true)).toBe(color);
	}
});

test("validation and rendering reject unsupported colors and CSS payloads", () => {
	for (const color of [
		"#fff",
		"#12345",
		"#1234567",
		"#12345678",
		"123456",
		"#gg0000",
		"#123456\n",
		" #123456",
		"#123456 ",
		"transparent",
		"GREEN",
		"rgb(0 0 0)",
		"url(secret)",
		"#123456; background: url(secret)",
		"var(--account)",
		"__proto__",
		"constructor",
		"",
	]) {
		expect(isAccountColor(color)).toBe(false);
		expect(accountColor(color, false)).toBeUndefined();
	}
	for (const value of [null, undefined, 123456, {}, ["#123456"]]) {
		expect(isAccountColor(value)).toBe(false);
	}
});

test("manual hex input normalizes only complete six-digit opaque colors", () => {
	expect(parseCustomAccountColor("  Ab12Cd  ")).toBe("#ab12cd");
	expect(parseCustomAccountColor("#AABBCC")).toBe("#aabbcc");
	expect(parseCustomAccountColor("#000000")).toBe("#000000");
	for (const text of [
		"",
		"#fff",
		"#12345678",
		"green",
		"#123 456",
		"##123456",
		"#123456; color:red",
	]) {
		expect(parseCustomAccountColor(text)).toBeUndefined();
	}
});
