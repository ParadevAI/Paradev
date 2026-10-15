import { describe, expect, test } from "bun:test";
import { isCloseShortcut } from "./isCloseShortcut";

function keydown(init: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		key: "Escape",
		repeat: false,
		defaultPrevented: false,
		isComposing: false,
		keyCode: 27,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...init,
	} as KeyboardEvent;
}

describe("isCloseShortcut", () => {
	test("closes on a plain Escape press", () => {
		expect(isCloseShortcut(keydown({}))).toBe(true);
	});

	test("leaves Escape to a popover or menu that already handled it", () => {
		expect(isCloseShortcut(keydown({ defaultPrevented: true }))).toBe(false);
	});

	test("ignores Escape that cancels an IME composition", () => {
		expect(isCloseShortcut(keydown({ isComposing: true }))).toBe(false);
		expect(isCloseShortcut(keydown({ keyCode: 229 }))).toBe(false);
	});

	test("ignores held, modified, and other keys", () => {
		expect(isCloseShortcut(keydown({ repeat: true }))).toBe(false);
		expect(isCloseShortcut(keydown({ metaKey: true }))).toBe(false);
		expect(isCloseShortcut(keydown({ key: "Enter" }))).toBe(false);
	});
});
