import { describe, expect, it } from "bun:test";
import { leavesAppDocument } from "./app-window-navigation";

const APP = "file:///Applications/Paradev.app/Contents/Resources/index.html#/";

describe("leavesAppDocument", () => {
	it("blocks an app window loading another site in its main frame", () => {
		expect(
			leavesAppDocument({
				resourceType: "mainFrame",
				isAppWindow: true,
				currentUrl: APP,
				targetUrl: "https://app.circleback.ai/meetings/1",
			}),
		).toBe(true);
	});

	it("allows reloads of the app document, including the dev server", () => {
		expect(
			leavesAppDocument({
				resourceType: "mainFrame",
				isAppWindow: true,
				currentUrl: "http://localhost:5173/#/workspaces",
				targetUrl: "http://localhost:5173/#/",
			}),
		).toBe(false);
	});

	it("allows the first load, subresources, and windows that are not app windows", () => {
		const base = {
			resourceType: "mainFrame",
			isAppWindow: true,
			currentUrl: APP,
			targetUrl: "https://example.com/",
		};
		expect(leavesAppDocument({ ...base, currentUrl: "" })).toBe(false);
		expect(leavesAppDocument({ ...base, resourceType: "subFrame" })).toBe(
			false,
		);
		expect(leavesAppDocument({ ...base, isAppWindow: false })).toBe(false);
	});
});
