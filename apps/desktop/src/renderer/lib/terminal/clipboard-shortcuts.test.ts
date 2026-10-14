import { describe, expect, it } from "bun:test";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "./clipboard-shortcuts";

function makeEvent(
	overrides: Partial<{
		code: string;
		metaKey: boolean;
		ctrlKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
	}>,
) {
	return {
		code: "KeyC",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	};
}

describe("shouldBubbleClipboardShortcut", () => {
	it("bubbles every Mac Cmd chord, Ghostty-style", () => {
		const cases = [
			{
				name: "Cmd+C (no selection)",
				event: makeEvent({ code: "KeyC", metaKey: true }),
			},
			{ name: "Cmd+V", event: makeEvent({ code: "KeyV", metaKey: true }) },
			{ name: "Cmd+Enter", event: makeEvent({ code: "Enter", metaKey: true }) },
			{ name: "Cmd+W", event: makeEvent({ code: "KeyW", metaKey: true }) },
			{
				name: "Cmd+Shift+K",
				event: makeEvent({ code: "KeyK", metaKey: true, shiftKey: true }),
			},
			{
				name: "Cmd+Alt+Left",
				event: makeEvent({ code: "ArrowLeft", metaKey: true, altKey: true }),
			},
		];

		for (const { name, event } of cases) {
			expect(
				shouldBubbleClipboardShortcut(event, {
					isMac: true,
					isWindows: false,
					hasSelection: false,
					appOwnsSelection: false,
				}),
				name,
			).toBe(true);
		}
	});

	it("does not bubble non-Cmd chords on Mac", () => {
		const cases = [
			{ name: "plain c", event: makeEvent({ code: "KeyC" }) },
			{
				name: "Ctrl+C (not a Mac idiom)",
				event: makeEvent({ code: "KeyC", ctrlKey: true }),
			},
			{
				name: "Shift+Insert",
				event: makeEvent({ code: "Insert", shiftKey: true }),
			},
			{
				name: "Ctrl+Shift+V (linux chord on mac)",
				event: makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
			},
		];

		for (const { name, event } of cases) {
			expect(
				shouldBubbleClipboardShortcut(event, {
					isMac: true,
					isWindows: false,
					hasSelection: false,
					appOwnsSelection: false,
				}),
				name,
			).toBe(false);
		}
	});

	it("sends Mac Cmd+C to an app that owns the selection only when xterm has none", () => {
		const mac = { isMac: true, isWindows: false };
		const cases = [
			{
				name: "Cmd+C, no selection, app owns the selection",
				event: makeEvent({ code: "KeyC", metaKey: true }),
				options: { ...mac, hasSelection: false, appOwnsSelection: true },
				expected: false,
			},
			{
				name: "Cmd+C with a selection copies it",
				event: makeEvent({ code: "KeyC", metaKey: true }),
				options: { ...mac, hasSelection: true, appOwnsSelection: true },
				expected: true,
			},
			{
				name: "Cmd+C to an app without its own selection stays out of the PTY",
				event: makeEvent({ code: "KeyC", metaKey: true }),
				options: { ...mac, hasSelection: false, appOwnsSelection: false },
				expected: true,
			},
			{
				name: "Cmd+Shift+C still bubbles",
				event: makeEvent({ code: "KeyC", metaKey: true, shiftKey: true }),
				options: { ...mac, hasSelection: false, appOwnsSelection: true },
				expected: true,
			},
			{
				name: "Cmd+V still bubbles",
				event: makeEvent({ code: "KeyV", metaKey: true }),
				options: { ...mac, hasSelection: false, appOwnsSelection: true },
				expected: true,
			},
		];

		for (const { name, event, options, expected } of cases) {
			expect(shouldBubbleClipboardShortcut(event, options), name).toBe(
				expected,
			);
		}
	});

	it("matches standard Windows / Linux clipboard bindings", () => {
		const cases = [
			{
				name: "Windows Ctrl+V",
				event: makeEvent({ code: "KeyV", ctrlKey: true }),
				options: {
					isMac: false,
					isWindows: true,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Windows Ctrl+Shift+V",
				event: makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				options: {
					isMac: false,
					isWindows: true,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Windows Ctrl+C with selection",
				event: makeEvent({ code: "KeyC", ctrlKey: true }),
				options: {
					isMac: false,
					isWindows: true,
					hasSelection: true,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Windows Ctrl+C without selection stays with PTY (SIGINT)",
				event: makeEvent({ code: "KeyC", ctrlKey: true }),
				options: {
					isMac: false,
					isWindows: true,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: false,
			},
			{
				name: "Windows Ctrl+Shift+C without selection still bubbles",
				event: makeEvent({ code: "KeyC", ctrlKey: true, shiftKey: true }),
				options: {
					isMac: false,
					isWindows: true,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Linux Ctrl+Shift+V",
				event: makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				options: {
					isMac: false,
					isWindows: false,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Linux Shift+Insert",
				event: makeEvent({ code: "Insert", shiftKey: true }),
				options: {
					isMac: false,
					isWindows: false,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Linux Ctrl+Shift+C without selection still bubbles",
				event: makeEvent({ code: "KeyC", ctrlKey: true, shiftKey: true }),
				options: {
					isMac: false,
					isWindows: false,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: true,
			},
			{
				name: "Linux Ctrl+Insert stays with the PTY",
				event: makeEvent({ code: "Insert", ctrlKey: true }),
				options: {
					isMac: false,
					isWindows: false,
					hasSelection: false,
					appOwnsSelection: false,
				},
				expected: false,
			},
		];

		for (const { name, event, options, expected } of cases) {
			expect(shouldBubbleClipboardShortcut(event, options), name).toBe(
				expected,
			);
		}
	});
});

describe("shouldSelectAllShortcut", () => {
	it("matches only the VS Code macOS terminal select-all binding", () => {
		const cases = [
			{
				name: "macOS Cmd+A",
				event: makeEvent({ code: "KeyA", metaKey: true }),
				isMac: true,
				expected: true,
			},
			{
				name: "windows Ctrl+A is not intercepted",
				event: makeEvent({ code: "KeyA", ctrlKey: true }),
				isMac: false,
				expected: false,
			},
			{
				name: "macOS Cmd+Shift+A is not intercepted",
				event: makeEvent({ code: "KeyA", metaKey: true, shiftKey: true }),
				isMac: true,
				expected: false,
			},
		];

		for (const { name, event, isMac, expected } of cases) {
			expect(shouldSelectAllShortcut(event, isMac), name).toBe(expected);
		}
	});
});
