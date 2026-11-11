import { describe, expect, test } from "bun:test";
import { resolveHotkeyEnabled } from "./resolveHotkeyEnabled";

describe("resolveHotkeyEnabled", () => {
	test("keeps the caller's choice on the active screen", () => {
		const predicate = () => true;
		expect(resolveHotkeyEnabled(undefined, true)).toBe(true);
		expect(resolveHotkeyEnabled(false, true)).toBe(false);
		expect(resolveHotkeyEnabled(predicate, true)).toBe(predicate);
	});

	test("turns the hotkey off on a hidden screen", () => {
		expect(resolveHotkeyEnabled(undefined, false)).toBe(false);
		expect(resolveHotkeyEnabled(true, false)).toBe(false);
		expect(resolveHotkeyEnabled(() => true, false)).toBe(false);
	});
});
