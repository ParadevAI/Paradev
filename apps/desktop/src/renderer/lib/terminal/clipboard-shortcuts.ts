export interface ClipboardShortcutEvent {
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

export interface ClipboardShortcutOptions {
	isMac: boolean;
	isWindows: boolean;
	hasSelection: boolean;
	appOwnsSelection: boolean;
}

/** Match VS Code's macOS terminal `Cmd+A` binding. */
export function shouldSelectAllShortcut(
	event: ClipboardShortcutEvent,
	isMac: boolean,
): boolean {
	return (
		isMac &&
		event.code === "KeyA" &&
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey
	);
}

/**
 * Decide whether a chord should bubble to the host (Electron menu accelerators,
 * OS clipboard handlers, etc.) instead of reaching xterm's kitty encoder and
 * leaking into the PTY as a CSI-u sequence.
 *
 * On macOS we follow Ghostty's rule (ghostty/src/input/key_encode.zig:534-545:
 * "on macOS, command+keys do not encode text"): every Cmd chord bubbles. Specific
 * chords the terminal wants to intercept (Cmd+Left/Right/Backspace, Cmd+A, etc.)
 * must run before this check in the caller.
 *
 * The one exception is Ghostty's `performable` copy: Cmd+C with no selection
 * reaches an app that owns the selection (it captures the mouse and reads kitty
 * keys), as `CSI 99;9u`, so Codex or Claude Code can copy what it highlighted.
 *
 * Windows/Linux have standard copy/paste keybinds that bubble selectively:
 * Ctrl+C only bubbles with a selection because it doubles as SIGINT.
 */
export function shouldBubbleClipboardShortcut(
	event: ClipboardShortcutEvent,
	options: ClipboardShortcutOptions,
): boolean {
	const { isMac, isWindows, hasSelection, appOwnsSelection } = options;

	if (isMac) {
		const onlyMetaC =
			event.code === "KeyC" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;
		if (onlyMetaC && !hasSelection && appOwnsSelection) return false;
		return event.metaKey;
	}

	const onlyCtrl =
		event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
	const ctrlShiftOnly =
		event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey;
	const onlyShift =
		event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;

	if (isWindows) {
		if (event.code === "KeyV" && (onlyCtrl || ctrlShiftOnly)) return true;
		if (event.code === "KeyC" && ctrlShiftOnly) return true;
		if (event.code === "KeyC" && onlyCtrl && hasSelection) return true;
		return false;
	}

	return (
		(event.code === "KeyV" && ctrlShiftOnly) ||
		(event.code === "Insert" && onlyShift) ||
		(event.code === "KeyC" && ctrlShiftOnly)
	);
}
