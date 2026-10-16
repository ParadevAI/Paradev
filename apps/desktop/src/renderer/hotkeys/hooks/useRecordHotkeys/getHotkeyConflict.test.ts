import { describe, expect, it } from "bun:test";
import { HOTKEYS, type HotkeyId } from "../../registry";
import { parseBinding } from "../../utils/binding";
import { getHotkeyConflict } from "./useRecordHotkeys";

const L = (chord: string) => ({
	version: 2 as const,
	mode: "logical" as const,
	chord,
});
const bound = (id: HotkeyId) => L(parseBinding(HOTKEYS[id].key ?? "").chord);

describe("which hotkey a new binding collides with", () => {
	it("a scoped hotkey may keep the chord of a global one: the scope decides which acts", () => {
		expect(getHotkeyConflict(bound("SPLIT_AUTO"), "INBOX_ARCHIVE")).toBeNull();
		expect(
			getHotkeyConflict(bound("OPEN_PROJECT"), "INBOX_OPEN_SOURCE"),
		).toBeNull();
	});

	it("two hotkeys of the same scope still collide", () => {
		expect(getHotkeyConflict(bound("INBOX_ARCHIVE"), "INBOX_PREVIOUS")).toBe(
			"INBOX_ARCHIVE",
		);
	});

	it("a global hotkey collides with another global one, never with a scoped one", () => {
		expect(getHotkeyConflict(bound("FOCUS_CHAT_INPUT"), "CLEAR_TERMINAL")).toBe(
			"FOCUS_CHAT_INPUT",
		);
	});
});
