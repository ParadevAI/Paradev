import { describe, expect, test } from "bun:test";
import { isSilencedByScope } from "./scope";

const previous = { scope: "inbox" as const, chord: "meta+k" };
const clearTerminal = { scope: undefined, chord: "meta+k" };
const newWorkspace = { scope: undefined, chord: "meta+n" };
const all = [previous, clearTerminal, newWorkspace];

describe("hotkeys that belong to a focused surface", () => {
	test("a scoped key acts only while its scope holds focus", () => {
		expect(isSilencedByScope({ hotkey: previous, active: "inbox", all })).toBe(
			false,
		);
		expect(isSilencedByScope({ hotkey: previous, active: null, all })).toBe(
			true,
		);
	});

	test("the global key on the same chord is silent while the scope holds focus, and works as before elsewhere", () => {
		expect(
			isSilencedByScope({ hotkey: clearTerminal, active: "inbox", all }),
		).toBe(true);
		expect(
			isSilencedByScope({ hotkey: clearTerminal, active: null, all }),
		).toBe(false);
	});

	test("a global key the scope does not bind is never silenced", () => {
		expect(
			isSilencedByScope({ hotkey: newWorkspace, active: "inbox", all }),
		).toBe(false);
	});
});
