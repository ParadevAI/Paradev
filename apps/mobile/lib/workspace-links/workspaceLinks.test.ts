import { describe, expect, test } from "bun:test";
import { workspaceIdFromUrl } from "./workspaceLinks";

const WEB = "https://app.superset.sh";

describe("workspaceIdFromUrl", () => {
	test("reads the id from a shared workspace link", () => {
		expect(workspaceIdFromUrl(`${WEB}/workspaces/ws-1`, WEB)).toBe("ws-1");
		expect(workspaceIdFromUrl(`${WEB}/workspaces/ws-1/?x=1#y`, WEB)).toBe(
			"ws-1",
		);
	});

	test("reads the id from the desktop deep link the web page redirects to", () => {
		expect(workspaceIdFromUrl("superset://v2-workspace/ws-1", WEB)).toBe(
			"ws-1",
		);
	});

	test("refuses another origin, however similar", () => {
		expect(
			workspaceIdFromUrl(
				"https://app.superset.sh.evil.example/workspaces/x",
				WEB,
			),
		).toBe(null);
		expect(workspaceIdFromUrl("http://app.superset.sh/workspaces/x", WEB)).toBe(
			null,
		);
	});

	test("refuses paths that are not a single workspace", () => {
		expect(workspaceIdFromUrl(`${WEB}/workspaces`, WEB)).toBe(null);
		expect(workspaceIdFromUrl(`${WEB}/workspaces/ws-1/files`, WEB)).toBe(null);
		expect(workspaceIdFromUrl(`${WEB}/page/ws-1`, WEB)).toBe(null);
		expect(workspaceIdFromUrl("superset:///workspace/ws-1?tab=t-1", WEB)).toBe(
			null,
		);
		expect(workspaceIdFromUrl("not a url", WEB)).toBe(null);
	});
});
