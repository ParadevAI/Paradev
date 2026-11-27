import { expect, test } from "bun:test";
import { dictationKeyAction } from "./dictationKeyAction";

const key = (
	name: string,
	modifiers: Partial<
		Record<"shiftKey" | "metaKey" | "ctrlKey" | "isComposing", boolean>
	> = {},
) => ({
	key: name,
	shiftKey: false,
	metaKey: false,
	ctrlKey: false,
	isComposing: false,
	...modifiers,
});

test("Escape cancels dictation", () => {
	expect(dictationKeyAction(key("Escape"))).toBe("cancel");
});

test.each([
	["Enter", {}],
	["Cmd+Enter", { metaKey: true }],
	["Ctrl+Enter", { ctrlKey: true }],
	["Cmd+Shift+Enter", { metaKey: true, shiftKey: true }],
	["Ctrl+Shift+Enter", { ctrlKey: true, shiftKey: true }],
] as const)("%s stops or retries dictation instead of sending", (_name, modifiers) => {
	expect(dictationKeyAction(key("Enter", modifiers))).toBe("finish");
});

test("Shift+Enter is left to the composer to add a line", () => {
	expect(dictationKeyAction(key("Enter", { shiftKey: true }))).toBeNull();
});

test("keys during IME composition and other keys are left alone", () => {
	expect(dictationKeyAction(key("Enter", { isComposing: true }))).toBeNull();
	expect(dictationKeyAction(key("a"))).toBeNull();
});
