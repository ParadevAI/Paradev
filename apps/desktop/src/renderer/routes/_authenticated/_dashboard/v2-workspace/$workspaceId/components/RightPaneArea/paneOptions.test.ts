import { describe, expect, test } from "bun:test";
import { getRightPaneOptions } from "./paneOptions";

describe("getRightPaneOptions", () => {
	test("offers every right pane kind, with desktop only on a sandbox", () => {
		const kinds = (canAddDesktop: boolean) =>
			getRightPaneOptions(canAddDesktop).map((option) => option.kind);

		expect(kinds(true)).toEqual([
			"files",
			"diff",
			"changes-list",
			"review",
			"pages-list",
			"browser",
			"desktop",
			"mobile",
			"terminal",
		]);
		expect(kinds(false)).toEqual(
			kinds(true).filter((kind) => kind !== "desktop"),
		);
	});
});
