import { describe, expect, test } from "bun:test";
import { createRightPane, getRightPaneOptions } from "./paneOptions";

describe("getRightPaneOptions", () => {
	test("offers desktop only on a sandbox and mobile only with its flag", () => {
		const kinds = (sandbox: boolean, mobilePane: boolean) =>
			getRightPaneOptions({ sandbox, mobilePane }).map((option) => option.kind);

		expect(kinds(true, true)).toEqual([
			"files",
			"diff",
			"review",
			"pages-list",
			"browser",
			"desktop",
			"mobile",
			"terminal",
		]);
		expect(kinds(false, true)).not.toContain("desktop");
		expect(kinds(true, false)).not.toContain("mobile");
	});
});

describe("createRightPane", () => {
	test("builds an openable pane for every option", () => {
		const deps = {
			mintTerminalId: () => "terminal-1",
			browserUrl: "https://example.com",
		};
		const panes = getRightPaneOptions({ sandbox: true, mobilePane: true }).map(
			(option) => createRightPane(option.kind, deps),
		);

		expect(panes.map((pane) => pane.kind)).toEqual([
			"files",
			"diff",
			"review",
			"pages-list",
			"browser",
			"desktop",
			"mobile",
			"terminal",
		]);
		expect(panes.find((pane) => pane.kind === "browser")?.data).toEqual({
			url: "https://example.com",
		});
		expect(panes.find((pane) => pane.kind === "terminal")?.data).toEqual({
			terminalId: "terminal-1",
			createOnAttach: true,
		});
	});
});
