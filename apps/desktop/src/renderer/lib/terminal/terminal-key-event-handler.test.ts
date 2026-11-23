import { afterAll, expect, test } from "bun:test";
import { Terminal } from "@xterm/xterm";
import { installTerminalKeyEventHandler } from "./terminal-key-event-handler";

const canvases = [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]
	.filter(Boolean)
	.map((canvas) => ({
		prototype: canvas.prototype,
		descriptor: Object.getOwnPropertyDescriptor(canvas.prototype, "getContext"),
	}));
for (const { prototype } of canvases) {
	Object.defineProperty(prototype, "getContext", {
		configurable: true,
		value: () => ({ font: "", measureText: () => ({ width: 7 }) }),
	});
}
afterAll(() => {
	for (const { prototype, descriptor } of canvases) {
		if (descriptor) Object.defineProperty(prototype, "getContext", descriptor);
		else delete (prototype as { getContext?: unknown }).getContext;
	}
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function shiftEnter(keyCode: number, isComposing: boolean): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key: "Enter",
		code: "Enter",
		shiftKey: true,
		isComposing,
		bubbles: true,
		cancelable: true,
	});
	Object.defineProperty(event, "keyCode", { value: keyCode });
	return event;
}

test("Shift+Enter that commits an IME composition sends the newline once, after the composed text", async () => {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const terminal = new Terminal({ cols: 20, rows: 3 });
	try {
		terminal.open(host);
		const dispose = installTerminalKeyEventHandler(terminal, {
			platform: "MacIntel",
		});
		const textarea = terminal.textarea;
		if (!textarea) throw new Error("Terminal textarea missing");
		const data: string[] = [];
		terminal.onData((chunk) => data.push(chunk));

		// The order Electron gives on macOS with the Korean 2-Set IME.
		textarea.dispatchEvent(new CompositionEvent("compositionstart"));
		const update = new Event("compositionupdate");
		Object.defineProperty(update, "data", { value: "글" });
		textarea.dispatchEvent(update);
		textarea.value = "글";
		textarea.setSelectionRange(1, 1);
		textarea.dispatchEvent(shiftEnter(229, true));
		textarea.dispatchEvent(new CompositionEvent("compositionend"));
		textarea.dispatchEvent(shiftEnter(13, false));
		await tick();

		expect(data).toEqual(["글", "\x1b\r"]);
		dispose();
	} finally {
		terminal.dispose();
		host.remove();
	}
});
