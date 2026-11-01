import { afterEach, describe, expect, mock, test } from "bun:test";
import type { TextInputKeyPressEvent } from "react-native";
import { useComposerKeys } from "./useComposerKeys.web";

function press(
	key: string,
	{ shift = false, meta = false, composing = false, coarse = false } = {},
) {
	(globalThis as { window?: unknown }).window = {
		matchMedia: () => ({ matches: coarse }),
	};
	const onSubmit = mock(() => {});
	const onDismiss = mock(() => {});
	const preventDefault = mock(() => {});
	const handler = useComposerKeys({ onSubmit, onDismiss });
	handler?.({
		key,
		shiftKey: shift,
		altKey: false,
		metaKey: meta,
		ctrlKey: false,
		preventDefault,
		nativeEvent: { isComposing: composing, keyCode: composing ? 229 : 13 },
	} as unknown as TextInputKeyPressEvent);
	return {
		submitted: onSubmit.mock.calls.length,
		dismissed: onDismiss.mock.calls.length,
		prevented: preventDefault.mock.calls.length,
	};
}

const originalWindow = (globalThis as { window?: unknown }).window;

describe("useComposerKeys on the web", () => {
	afterEach(() => {
		(globalThis as { window?: unknown }).window = originalWindow;
	});

	test("Enter sends instead of adding a line", () => {
		expect(press("Enter")).toEqual({
			submitted: 1,
			dismissed: 0,
			prevented: 1,
		});
	});

	test("Shift+Enter and IME composition keep the newline", () => {
		expect(press("Enter", { shift: true }).submitted).toBe(0);
		expect(press("Enter", { composing: true }).submitted).toBe(0);
	});

	test("a touch keyboard's Enter adds a line, but Cmd+Enter still sends", () => {
		expect(press("Enter", { coarse: true }).submitted).toBe(0);
		expect(press("Enter", { coarse: true, meta: true }).submitted).toBe(1);
	});

	test("Escape closes the composer", () => {
		expect(press("Escape")).toEqual({
			submitted: 0,
			dismissed: 1,
			prevented: 1,
		});
	});
});
