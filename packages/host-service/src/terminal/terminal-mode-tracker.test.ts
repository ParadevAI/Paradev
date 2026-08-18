import { describe, expect, test } from "bun:test";
import { createModeTracker } from "./terminal-mode-tracker";

const enc = new TextEncoder();
const dec = new TextDecoder();

function preambleString(tracker: ReturnType<typeof createModeTracker>): string {
	const bytes = tracker.buildPreamble();
	return bytes ? dec.decode(bytes) : "";
}

/**
 * The full sync emitted when every tracked mode is at its default. The
 * preamble asserts modes in both directions (the attaching xterm may hold
 * non-default state from a restored snapshot), so defaults are explicit
 * disables — except DECOM (`?6`, homes the cursor) and synchronized output
 * (`?2026h` would suspend rendering), which are asymmetric by design.
 */
const DEFAULT_SYNC =
	"\x1b[?1l\x1b[?66l\x1b[?2004l\x1b[4l\x1b[?45l\x1b[?1004l" +
	"\x1b[?25h\x1b[?7h\x1b[?2026l\x1b[?1003l\x1b[=0;1u";

describe("createModeTracker", () => {
	test("default state emits the full both-directions sync", () => {
		const t = createModeTracker(120, 32);
		expect(preambleString(t)).toBe(DEFAULT_SYNC);
		t.dispose();
	});

	test("kitty keyboard push survives many KB of unrelated output", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));

		// 200 KB of filler — well past the host-service FIFO's 64 KiB cap.
		// Tracker state is independent of the FIFO so flags should hold.
		const filler = "x".repeat(2048);
		for (let i = 0; i < 100; i += 1) {
			t.feed(enc.encode(filler));
		}

		expect(preambleString(t)).toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("preamble disarms kitty after explicit pop", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		expect(preambleString(t)).toContain("\x1b[=7;1u");

		t.feed(enc.encode("\x1b[<u"));
		expect(preambleString(t)).toContain("\x1b[=0;1u");
		expect(preambleString(t)).not.toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("preamble disarms kitty after explicit set-to-zero", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		t.feed(enc.encode("\x1b[=0;1u"));
		expect(preambleString(t)).toContain("\x1b[=0;1u");
		expect(preambleString(t)).not.toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("bracketed paste mode is asserted in both directions", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?2004h"));
		expect(preambleString(t)).toContain("\x1b[?2004h");
		t.feed(enc.encode("\x1b[?2004l"));
		// Explicit disable, not silence: the attaching xterm may still be
		// armed from before a reattach gap.
		expect(preambleString(t)).toContain("\x1b[?2004l");
		t.dispose();
	});

	test("focus reporting and mouse tracking are captured", () => {
		// `?1002h` is button-tracking, NOT SGR encoding (`?1006h`). xterm.js's
		// public IModes doesn't expose mouse encoding format, so the preamble
		// can't restore it — clients reattaching mid-session keep the default
		// X10 encoding. Acceptable today; revisit if a TUI relying on SGR
		// breaks on reattach.
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?1004h\x1b[?1002h"));
		const preamble = preambleString(t);
		expect(preamble).toContain("\x1b[?1004h");
		expect(preamble).toContain("\x1b[?1002h");
		expect(preamble).not.toContain("\x1b[?1004l");
		expect(preamble).not.toContain("\x1b[?1003l");
		t.dispose();
	});

	test("mouse tracking off is an explicit disarm", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?1002h"));
		t.feed(enc.encode("\x1b[?1002l"));
		expect(preambleString(t)).toContain("\x1b[?1003l");
		t.dispose();
	});

	test("multi-mode preamble lists DEC modes before kitty", () => {
		// Order matters: a peer applying the preamble should see DEC modes
		// settle before the kitty Set, so a kitty-aware program reading back
		// state via `\x1b[?u` query gets a consistent answer.
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?2004h\x1b[?1004h\x1b[>7u"));
		const p = preambleString(t);
		expect(p.indexOf("\x1b[?2004h")).toBeGreaterThanOrEqual(0);
		expect(p.indexOf("\x1b[?1004h")).toBeGreaterThanOrEqual(0);
		expect(p.indexOf("\x1b[=7;1u")).toBeGreaterThan(p.indexOf("\x1b[?2004h"));
		t.dispose();
	});

	test("cursor visibility is asserted in both directions", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?25l"));
		expect(preambleString(t)).toContain("\x1b[?25l");
		// A show must be re-asserted too: the attaching xterm may hold a
		// hidden cursor from a restored snapshot or an earlier preamble.
		t.feed(enc.encode("\x1b[?25h"));
		const p = preambleString(t);
		expect(p).toContain("\x1b[?25h");
		expect(p).not.toContain("\x1b[?25l");
		t.dispose();
	});

	test("preamble is a fixpoint: applying it to a fresh peer reproduces it", () => {
		// The property the resync depends on: after a peer consumes the
		// preamble, its mode state equals the tracker's — so a second
		// preamble built from the peer is byte-identical.
		const source = createModeTracker(120, 32);
		source.feed(
			enc.encode("\x1b[?2004h\x1b[?1004h\x1b[?1002h\x1b[?25l\x1b[?1h\x1b[>7u"),
		);
		const peer = createModeTracker(120, 32);
		const preamble = source.buildPreamble();
		if (!preamble) throw new Error("expected a preamble");
		peer.feed(preamble);
		expect(preambleString(peer)).toBe(dec.decode(preamble));
		source.dispose();
		peer.dispose();
	});

	test("default-state preamble does not move the peer's cursor", () => {
		// Guards the DECOM exception: `?6h`/`?6l` home the cursor, so the
		// preamble must never emit `?6l` for a default-state program. A
		// regression here teleports the cursor of every idle terminal on
		// every silent reconnect.
		const source = createModeTracker(120, 32);
		const peer = createModeTracker(120, 32);
		peer.feed(enc.encode("line one\r\nab"));
		const before = peer.cursorPosition();
		expect(before).toEqual({ x: 2, y: 1 });
		const preamble = source.buildPreamble();
		if (!preamble) throw new Error("expected a preamble");
		peer.feed(preamble);
		expect(peer.cursorPosition()).toEqual(before);
		source.dispose();
		peer.dispose();
	});

	test("resize is idempotent and doesn't reset mode state", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		t.resize(80, 24);
		t.resize(80, 24);
		t.resize(160, 50);
		expect(preambleString(t)).toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("escape sequences split across feeds are still parsed", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b["));
		t.feed(enc.encode(">7"));
		t.feed(enc.encode("u"));
		expect(preambleString(t)).toContain("\x1b[=7;1u");
		t.dispose();
	});
});
