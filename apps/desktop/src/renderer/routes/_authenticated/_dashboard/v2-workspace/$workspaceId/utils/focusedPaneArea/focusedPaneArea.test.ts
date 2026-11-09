import { describe, expect, test } from "bun:test";
import { focusedPaneArea } from "./focusedPaneArea";

describe("focusedPaneArea", () => {
	test("follows the area pressed last while the sidebar is open", () => {
		expect(
			focusedPaneArea({ rightPaneAreaOpen: true, lastArea: "right" }),
		).toBe("right");
		expect(
			focusedPaneArea({ rightPaneAreaOpen: true, lastArea: "center" }),
		).toBe("center");
	});

	test("falls back to the main area once the sidebar closes", () => {
		expect(
			focusedPaneArea({ rightPaneAreaOpen: false, lastArea: "right" }),
		).toBe("center");
	});
});
