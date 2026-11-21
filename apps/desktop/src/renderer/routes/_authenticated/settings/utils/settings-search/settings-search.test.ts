import { describe, expect, it } from "bun:test";
import type { SettingsSectionVisibility } from "../settingsSections";
import {
	getOfferedSections,
	getVisibleItemsForSection,
	getVisibleMatchCountBySection,
	SETTING_ITEM_ID,
	type SettingsItem,
	searchSettings,
} from "./settings-search";

function getIds(items: SettingsItem[]): string[] {
	return items.map((item) => item.id);
}

describe("settings search - font settings", () => {
	it('searching "font" returns both APPEARANCE_EDITOR_FONT and APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "terminal font" returns APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("terminal font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "editor" returns APPEARANCE_EDITOR_FONT', () => {
		const results = searchSettings("editor");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it('searching "monospace" returns both font items', () => {
		const results = searchSettings("monospace");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "Editor Font" is case-insensitive', () => {
		const results = searchSettings("Editor Font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it("normalizes whitespace between search terms", () => {
		const results = searchSettings("  terminal   font  ");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("empty search returns all settings items", () => {
		const results = searchSettings("");
		expect(results.length).toBeGreaterThan(0);
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("font items have correct section", () => {
		const results = searchSettings("font");
		const editorFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		);
		const terminalFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		);

		expect(editorFont?.section).toBe("appearance");
		expect(terminalFont?.section).toBe("appearance");
	});
});

describe("settings search - hosts", () => {
	it('searching "delete host" returns the host deletion setting', () => {
		const ids = getIds(searchSettings("delete host"));

		expect(ids).toContain(SETTING_ITEM_ID.HOST_DELETE);
	});
});

describe("settings search - quota rings switch", () => {
	it('searching "sidebar" in Usage returns the quota rings switch', () => {
		const ids = getVisibleItemsForSection({
			section: "usage",
			searchQuery: "sidebar",
		});
		expect(ids).toContain(SETTING_ITEM_ID.USAGE_RAIL_RINGS);
	});

	it('searching "quota" matches the quota rings switch', () => {
		const ids = getIds(searchSettings("quota"));
		expect(ids).toContain(SETTING_ITEM_ID.USAGE_RAIL_RINGS);
	});

	it("lists the quota rings switch in Usage without a search", () => {
		const ids = getVisibleItemsForSection({
			section: "usage",
			searchQuery: "",
		});
		expect(ids).toContain(SETTING_ITEM_ID.USAGE_RAIL_RINGS);
	});
});

describe("settings search - auto save", () => {
	it('lists Auto Save when searching "onFocusChange"', () => {
		const ids = getVisibleItemsForSection({
			section: "files",
			searchQuery: "onFocusChange",
		});
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_FILE_AUTO_SAVE);
	});

	it.each([
		"after delay",
		"on focus change",
		"on window change",
	])('lists Auto Save when searching "%s"', (searchQuery) => {
		const ids = getVisibleItemsForSection({
			section: "files",
			searchQuery,
		});
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_FILE_AUTO_SAVE);
	});
});

function visible(
	overrides: Partial<SettingsSectionVisibility> = {},
): SettingsSectionVisibility {
	return {
		isMac: true,
		isAdmin: true,
		pluginsEnabled: false,
		cloudUsageEnabled: false,
		allowedSections: getOfferedSections(false),
		...overrides,
	};
}

describe("settings search - mobile", () => {
	it("finds the mobile section", () => {
		expect(getVisibleMatchCountBySection("iPhone", visible()).mobile).toBe(1);
	});
});

describe("settings search - visibility", () => {
	it("counts matches only in sections the settings nav shows", () => {
		expect(
			getVisibleMatchCountBySection("marketplace", visible()).plugins,
		).toBeUndefined();
		expect(
			getVisibleMatchCountBySection(
				"marketplace",
				visible({ pluginsEnabled: true }),
			).plugins,
		).toBeGreaterThan(0);
		expect(
			getVisibleMatchCountBySection("gb-hours", visible()).cloudUsage,
		).toBeUndefined();
		expect(
			getVisibleMatchCountBySection(
				"gb-hours",
				visible({ cloudUsageEnabled: true }),
			).cloudUsage,
		).toBe(1);
	});
});
