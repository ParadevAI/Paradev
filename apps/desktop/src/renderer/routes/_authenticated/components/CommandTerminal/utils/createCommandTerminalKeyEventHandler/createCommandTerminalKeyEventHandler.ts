import type { Terminal as XTerm } from "@xterm/xterm";
import {
	createTerminalKeyEventHandler,
	type TerminalKeyEventHandlerOptions,
} from "renderer/lib/terminal/terminal-key-event-handler";

function isMacPlatform(platform: string): boolean {
	const lower = platform.toLowerCase();
	return lower === "darwin" || lower.includes("mac");
}

/**
 * Login prompts in a command terminal ask the user to paste a code or key, and
 * have no use for a literal ^V. So plain Ctrl+V pastes on Linux too, as it
 * already does on Windows.
 */
export function createCommandTerminalKeyEventHandler(
	terminal: XTerm,
	options: TerminalKeyEventHandlerOptions = {},
) {
	const platform =
		options.platform ??
		(typeof navigator !== "undefined" ? navigator.platform : "");
	const isMac = isMacPlatform(platform);
	const baseHandler = createTerminalKeyEventHandler(terminal, options);

	return (event: KeyboardEvent): boolean => {
		const isPlainCtrlV =
			event.code === "KeyV" &&
			event.ctrlKey &&
			!event.metaKey &&
			!event.altKey &&
			!event.shiftKey;
		// Do NOT preventDefault: the browser keydown -> paste pipeline fires
		// xterm's paste event.
		if (!isMac && isPlainCtrlV) return false;
		return baseHandler(event);
	};
}
