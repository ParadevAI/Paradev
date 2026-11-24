import { describe, expect, test } from "bun:test";
import { INTERRUPT_KEYS, parseTerminalKeys } from "./terminal-keys";

describe("parseTerminalKeys", () => {
	test("maps named keys and ctrl chords to their bytes, in order", () => {
		expect(parseTerminalKeys("Esc, ctrl+c,up,enter,shift+tab")).toEqual([
			"\x1b",
			"\x03",
			"\x1b[A",
			"\r",
			"\x1b[Z",
		]);
	});

	test("accepts single characters, C- aliases, alt chords and function keys", () => {
		expect(parseTerminalKeys("y,Y,C-c,alt+b,f5")).toEqual([
			"y",
			"Y",
			"\x03",
			"\x1bb",
			"\x1b[15~",
		]);
	});

	test("rejects an unknown key name", () => {
		expect(() => parseTerminalKeys("esc,hyper+x")).toThrow(
			"Unknown key: hyper+x",
		);
		expect(() => parseTerminalKeys("enter,constructor")).toThrow(
			"Unknown key: constructor",
		);
	});

	test("encodes a modified arrow as one CSI sequence, not Escape plus an arrow", () => {
		expect(parseTerminalKeys("shift+up")).toEqual(["\x1b[1;2A"]);
		expect(parseTerminalKeys("alt+up")).toEqual(["\x1b[1;3A"]);
		expect(parseTerminalKeys("shift+alt+left")).toEqual(["\x1b[1;4D"]);
		expect(parseTerminalKeys("ctrl+right")).toEqual(["\x1b[1;5C"]);
		expect(parseTerminalKeys("alt+down")).toEqual(["\x1b[1;3B"]);
		expect(parseTerminalKeys("ctrl+shift+left")).toEqual(["\x1b[1;6D"]);
		// Order inside the chord does not change the bytes.
		expect(parseTerminalKeys("alt+shift+right")).toEqual(["\x1b[1;4C"]);
	});

	test("keeps plain arrows, alt-letter chords and the interrupt classification", () => {
		expect(parseTerminalKeys("up,alt+b,shift+tab")).toEqual([
			"\x1b[A",
			"\x1bb",
			"\x1b[Z",
		]);
		// A modified arrow starts with Escape but is one complete key: it must
		// not be read as a standalone interrupt.
		for (const key of parseTerminalKeys("alt+up,shift+left")) {
			expect(INTERRUPT_KEYS.has(key)).toBe(false);
		}
	});

	test("rejects a modifier it cannot encode instead of writing a wrong chord", () => {
		expect(() => parseTerminalKeys("hyper+up")).toThrow(
			"Unknown key: hyper+up",
		);
		expect(() => parseTerminalKeys("shift+up+left")).toThrow(
			"Unknown key: shift+up+left",
		);
		expect(() => parseTerminalKeys("shift+shift+up")).toThrow(
			"Unknown key: shift+shift+up",
		);
	});
});
