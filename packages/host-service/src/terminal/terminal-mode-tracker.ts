// Tracks terminal-mode state (kitty keyboard, bracketed paste, focus, mouse,
// app cursor, cursor visibility, …) by feeding every PTY-output chunk through
// a headless xterm.js. `buildPreamble()` returns the byte sequence that brings
// an attaching renderer xterm — fresh, rebuilt from a persisted snapshot, or
// long-lived with arbitrarily diverged mode state — to the modes the running
// program believes are active.
//
// Live programs typically set these modes ONCE at startup (e.g. codex emits
// `\x1b[>7u` to enable kitty keyboard). Those bytes are broadcast straight to
// the live socket and never enter the FIFO replay, so a renderer reload
// reattaches a fresh xterm with default modes — Shift+Enter starts submitting
// instead of inserting newline, paste arrives as keystrokes, etc.
//
// Pattern adapted from VSCode's XtermSerializer
// (src/vs/platform/terminal/node/ptyService.ts).

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");

export interface ModeTracker {
	feed(bytes: Uint8Array): void;
	resize(cols: number, rows: number): void;
	buildPreamble(): Uint8Array | null;
	isBracketedPasteActive(): boolean;
	isFocusReportingActive(): boolean;
	/** Current cursor position on the mirrored screen, 0-based viewport coords. */
	cursorPosition(): { x: number; y: number };
	snapshot(maxLines?: number): TerminalSnapshot;
	dispose(): void;
}

export interface TerminalSnapshot {
	cols: number;
	rows: number;
	/** Plain text of the emulator buffer (alt-screen for TUI agents). */
	text: string;
}

// Reaches into private xterm internals: synchronous parsing and kitty
// keyboard flags aren't on the public API, but @xterm/headless and
// @xterm/xterm share the same engine, so the shape is stable. Used the same
// way by xterm's own SerializeAddon.
type HeadlessInternals = {
	_core?: {
		_writeBuffer?: { writeSync(data: string | Uint8Array): void };
		coreService?: { kittyKeyboard?: { flags: number } };
		optionsService?: {
			rawOptions: { vtExtensions?: { kittyKeyboard?: boolean } };
		};
	};
};

export function createModeTracker(cols: number, rows: number): ModeTracker {
	const term = new HeadlessTerminal({
		cols,
		rows,
		// Retains recent scrollback so `snapshot()` can serve line-mode history,
		// not just the visible screen. Irrelevant to alt-screen TUIs (no
		// scrollback), but cheap insurance for plain shell output.
		scrollback: 1000,
		allowProposedApi: true,
	});
	const internals = term as unknown as HeadlessInternals;

	// Validate the private surface up front so a future @xterm/headless
	// upgrade that renames internals fails loudly at session construction
	// rather than silently throwing inside every PTY-output callback.
	const optionsRaw = internals._core?.optionsService?.rawOptions;
	const writeBuffer = internals._core?._writeBuffer;
	if (!optionsRaw || typeof writeBuffer?.writeSync !== "function") {
		throw new Error(
			"@xterm/headless internals not found (optionsService.rawOptions, " +
				"_writeBuffer.writeSync). Likely a version-pinning regression — " +
				"check that the pinned version still exposes these.",
		);
	}

	// `vtExtensions.kittyKeyboard` is in the public typings but the headless
	// option sanitizer silently drops it (its DEFAULT_OPTIONS table omits the
	// key). Without this, kitty handlers early-return and `\x1b[>7u` is a
	// no-op. Set it on rawOptions directly.
	optionsRaw.vtExtensions = { kittyKeyboard: true };

	// `Terminal.write` is async-buffered, so `term.modes` lags behind feeds.
	// Pump synchronously through the internal WriteBuffer so the preamble can
	// be built immediately after a feed in the WS-attach hot path.

	const buildPreamble = (): Uint8Array | null => {
		const m = term.modes;
		const parts: string[] = [];

		// The preamble is an authoritative resync, not a diff against xterm
		// defaults: the attaching xterm is not always fresh. It may be rebuilt
		// from a persisted SerializeAddon snapshot (which bakes in whatever
		// modes were active at capture — e.g. `?25l` when the snapshot caught
		// an agent CLI mid-repaint, stranding the cursor invisible), or be a
		// long-lived xterm reattaching after a gap whose mode restores were
		// lost. So every mode is asserted in BOTH directions, the way tmux
		// resyncs a client tty on attach (tty.c: tty->mode = ALL_MODES, then
		// diff down). The two exceptions below are modes whose set/reset has
		// side effects beyond the flag itself.
		parts.push(m.applicationCursorKeysMode ? "\x1b[?1h" : "\x1b[?1l");
		parts.push(m.applicationKeypadMode ? "\x1b[?66h" : "\x1b[?66l");
		parts.push(m.bracketedPasteMode ? "\x1b[?2004h" : "\x1b[?2004l");
		parts.push(m.insertMode ? "\x1b[4h" : "\x1b[4l");
		// Exception: DECOM (?6) is asserted only when set — both DECSET and
		// DECRST home the cursor, so an unconditional `?6l` would teleport
		// the client's cursor on every attach.
		if (m.originMode) parts.push("\x1b[?6h");
		parts.push(m.reverseWraparoundMode ? "\x1b[?45h" : "\x1b[?45l");
		parts.push(m.sendFocusMode ? "\x1b[?1004h" : "\x1b[?1004l");
		parts.push(m.showCursor ? "\x1b[?25h" : "\x1b[?25l");
		parts.push(m.wraparoundMode ? "\x1b[?7h" : "\x1b[?7l");
		// Exception: synchronized output (?2026) is only ever cleared —
		// re-asserting `h` would suspend the client's rendering until the
		// program's next end-marker, while `l` un-wedges a client whose
		// end-marker was lost in a reattach gap.
		if (!m.synchronizedOutputMode) parts.push("\x1b[?2026l");

		switch (m.mouseTrackingMode) {
			case "x10":
				parts.push("\x1b[?9h");
				break;
			case "vt200":
				parts.push("\x1b[?1000h");
				break;
			case "drag":
				parts.push("\x1b[?1002h");
				break;
			case "any":
				parts.push("\x1b[?1003h");
				break;
			case "none":
				// Any mouse level's reset clears the whole protocol, so one
				// `?1003l` disarms a client whose TUI died with tracking on.
				parts.push("\x1b[?1003l");
				break;
		}

		const kittyFlags = internals._core?.coreService?.kittyKeyboard?.flags ?? 0;
		// `=N;1u` sets flags directly — restoring effective state to the
		// peer, not modeling the program's push/pop stack. `=0;1u` likewise
		// disarms a client left CSI-u encoded by an uncleanly killed TUI.
		parts.push(`\x1b[=${kittyFlags};1u`);

		return new TextEncoder().encode(parts.join(""));
	};

	const snapshot = (maxLines?: number): TerminalSnapshot => {
		const buffer = term.buffer.active;
		const total = buffer.length;
		const start = maxLines && maxLines > 0 ? Math.max(0, total - maxLines) : 0;
		const lines: string[] = [];
		for (let y = start; y < total; y++) {
			lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
		}
		// Trim trailing blank rows so the snapshot ends at real content.
		while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
		return { cols: term.cols, rows: term.rows, text: lines.join("\n") };
	};

	return {
		feed(bytes) {
			writeBuffer.writeSync(bytes);
		},
		resize(nextCols, nextRows) {
			if (term.cols === nextCols && term.rows === nextRows) return;
			term.resize(nextCols, nextRows);
		},
		buildPreamble,
		isBracketedPasteActive() {
			return term.modes.bracketedPasteMode;
		},
		isFocusReportingActive() {
			return term.modes.sendFocusMode;
		},
		cursorPosition() {
			const buffer = term.buffer.active;
			return { x: buffer.cursorX, y: buffer.cursorY };
		},
		snapshot,
		dispose() {
			term.dispose();
		},
	};
}
