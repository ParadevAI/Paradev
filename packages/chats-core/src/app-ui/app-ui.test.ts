import { describe, expect, test } from "bun:test";
import { APP_UI_ICON_NAMES, APP_UI_ICONS } from "./app-ui.ts";

describe("app header icons", () => {
	test("every name has an SF Symbol and a Lucide icon", () => {
		for (const name of APP_UI_ICON_NAMES) {
			expect(APP_UI_ICONS[name].sf).toMatch(/^[a-z0-9.]+$/);
			expect(APP_UI_ICONS[name].lucide).toMatch(/^[A-Z][A-Za-z0-9]+$/);
		}
	});
});
