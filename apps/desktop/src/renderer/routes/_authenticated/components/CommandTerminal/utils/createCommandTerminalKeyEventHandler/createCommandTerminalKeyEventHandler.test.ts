import { expect, it } from "bun:test";
import type { Terminal } from "@xterm/xterm";
import { createCommandTerminalKeyEventHandler } from "./createCommandTerminalKeyEventHandler";

const terminal = {
	hasSelection: () => false,
	modes: { mouseTrackingMode: "none" },
	input: () => {},
	selectAll: () => {},
} as unknown as Terminal;

function keydown(init: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		type: "keydown",
		key: "v",
		code: "KeyV",
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		preventDefault: () => {},
		...init,
	} as KeyboardEvent;
}

it("leaves plain Ctrl+V to the browser paste on Linux but not on macOS", () => {
	const linux = createCommandTerminalKeyEventHandler(terminal, {
		platform: "Linux x86_64",
	});
	const mac = createCommandTerminalKeyEventHandler(terminal, {
		platform: "darwin",
	});

	expect(linux(keydown({ ctrlKey: true }))).toBe(false);
	expect(linux(keydown({ code: "KeyC", key: "c", ctrlKey: true }))).toBe(true);
	expect(mac(keydown({ ctrlKey: true }))).toBe(true);
	expect(mac(keydown({ metaKey: true }))).toBe(false);
});
