import { describe, expect, it } from "bun:test";
import { migrateHotkeyOverrides } from "./hotkeyOverridesStore";

describe("migrateHotkeyOverrides", () => {
	it("moves an Undo Archive binding to the shared Undo hotkey", () => {
		expect(
			migrateHotkeyOverrides(
				{ overrides: { UNDO_ARCHIVE_WORKSPACE: "meta+u", NEW_TERMINAL: null } },
				0,
			),
		).toEqual({ overrides: { UNDO: "meta+u", NEW_TERMINAL: null } });
	});

	it("keeps an explicit unassignment", () => {
		expect(
			migrateHotkeyOverrides(
				{ overrides: { UNDO_ARCHIVE_WORKSPACE: null } },
				0,
			),
		).toEqual({ overrides: { UNDO: null } });
	});

	it("leaves already-migrated state alone", () => {
		const state = { overrides: { UNDO: "meta+u" } };
		expect(migrateHotkeyOverrides(state, 1)).toBe(state);
	});
});
