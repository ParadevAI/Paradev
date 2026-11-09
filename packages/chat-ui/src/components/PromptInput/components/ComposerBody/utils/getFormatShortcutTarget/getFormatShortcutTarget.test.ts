import { expect, test } from "bun:test";
import { getFormatShortcutTarget } from "./getFormatShortcutTarget";

const NO_MODIFIERS = {
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
};

function keyDown(
	key: string,
	modifiers: Partial<typeof NO_MODIFIERS>,
	code = `Key${key.toUpperCase()}`,
) {
	return { key, code, ...NO_MODIFIERS, ...modifiers };
}

test.each([
	["⌘B, caret", true, keyDown("b", { metaKey: true }), false, "app"],
	["⌘B, selection", true, keyDown("b", { metaKey: true }), true, "editor"],
	[
		"⌘B, non-Latin layout",
		true,
		keyDown("и", { metaKey: true }, "KeyB"),
		false,
		"app",
	],
	["⌘I, caret", true, keyDown("i", { metaKey: true }), false, "editor"],
	["⌘⇧B", true, keyDown("b", { metaKey: true, shiftKey: true }), false, null],
	["Ctrl+B on macOS", true, keyDown("b", { ctrlKey: true }), false, null],
	["Ctrl+B, caret", false, keyDown("b", { ctrlKey: true }), false, "editor"],
	["Ctrl+I, caret", false, keyDown("i", { ctrlKey: true }), false, "editor"],
	[
		"Ctrl+Shift+B",
		false,
		keyDown("b", { ctrlKey: true, shiftKey: true }),
		false,
		null,
	],
	["⌘K", true, keyDown("k", { metaKey: true }), false, null],
] as const)("%s (apple: %p)", (_label, isApple, event, hasSelection, expected) => {
	expect(getFormatShortcutTarget(event, { isApple, hasSelection })).toBe(
		expected,
	);
});
