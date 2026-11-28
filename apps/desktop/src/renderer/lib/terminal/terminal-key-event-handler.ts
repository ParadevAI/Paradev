import type { Terminal as XTerm } from "@xterm/xterm";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "./clipboard-shortcuts";
import { translateLineEditChord } from "./line-edit-translations";
import { sendUserInput } from "./terminal-replay-write";

interface TerminalKeyEventHandlerOptions {
	platform?: string;
}

// An app that captures the mouse draws its own selection; one that also reads
// kitty keys can receive Cmd+C to copy it. xterm exposes the kitty flags only
// on its private core service.
function appOwnsSelection(terminal: XTerm): boolean {
	if (terminal.modes.mouseTrackingMode === "none") return false;
	const internal = terminal as XTerm & {
		_core?: { coreService?: { kittyKeyboard?: { flags?: number } } };
	};
	return (internal._core?.coreService?.kittyKeyboard?.flags ?? 0) > 0;
}

// xterm sends committed IME text from a timer that starts on compositionend.
// Its keydown hook sends that text at once, as xterm does before a plain Enter.
// The hook returns false when the IME owns the key (keyCode 229).
function commitComposition(terminal: XTerm, event: KeyboardEvent): boolean {
	const internal = terminal as XTerm & {
		_core?: {
			_compositionHelper?: { keydown(event: KeyboardEvent): boolean };
		};
	};
	return internal._core?._compositionHelper?.keydown(event) ?? true;
}

function resolvePlatform(options: TerminalKeyEventHandlerOptions): string {
	const raw =
		options.platform !== undefined
			? options.platform
			: typeof navigator !== "undefined"
				? navigator.platform
				: "";
	const lower = raw.toLowerCase();
	// Node's `process.platform === "darwin"` is a common explicit input;
	// without normalization it'd match `"win"` substring and be treated as
	// Windows. Browser/Electron `navigator.platform` returns "MacIntel" so
	// this only kicks in for Node-style callers (incl. tests).
	if (lower === "darwin") return "mac";
	return lower;
}

// xterm's _keyDown calls stopPropagation after processing, so any chord we
// want the host (react-hotkeys-hook, Electron menu accelerators) or the shell
// (Ctrl+A/E/U escape sequences for line edit) to see must short-circuit xterm
// before it runs. (VSCode pattern: terminalInstance.ts:1116-1175.)
//
// Kitty keyboard protocol is enabled, which means every Mac Cmd chord xterm
// sees gets CSI-u encoded and leaks into TUIs as a literal char. Ghostty
// sidesteps this by suppressing all super/Cmd chords on macOS before the
// encoder runs (ghostty/src/input/key_encode.zig:534-545). We do the same via
// shouldBubbleClipboardShortcut's Mac branch.
function createTerminalKeyEventHandler(
	terminal: XTerm,
	options: TerminalKeyEventHandlerOptions = {},
) {
	const platform = resolvePlatform(options);
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	return (event: KeyboardEvent): boolean => {
		if (resolveHotkeyFromEvent(event) !== null) return false;

		const translation = translateLineEditChord(event, { isMac, isWindows });
		if (translation !== null) {
			if (event.type === "keydown") {
				if (!commitComposition(terminal, event)) return true;
				event.preventDefault();
				sendUserInput(terminal, translation);
			}
			return false;
		}

		if (shouldSelectAllShortcut(event, isMac)) {
			if (event.type === "keydown") {
				event.preventDefault();
				terminal.selectAll();
			}
			return false;
		}

		if (
			shouldBubbleClipboardShortcut(event, {
				isMac,
				isWindows,
				hasSelection: terminal.hasSelection(),
				appOwnsSelection: appOwnsSelection(terminal),
			})
		) {
			// Do NOT preventDefault: the browser keydown -> paste pipeline is what
			// fires xterm's paste event. We only short-circuit xterm's key encoder.
			return false;
		}

		return true;
	};
}

export function installTerminalKeyEventHandler(
	terminal: XTerm,
	options: TerminalKeyEventHandlerOptions = {},
): () => void {
	terminal.attachCustomKeyEventHandler(
		createTerminalKeyEventHandler(terminal, options),
	);

	return () => {
		terminal.attachCustomKeyEventHandler(() => true);
	};
}
