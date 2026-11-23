import { describe, expect, test } from "bun:test";
import { parseDesktopWindowRoute } from "./desktop-windows";

describe("parseDesktopWindowRoute", () => {
	test("reads a workspace from the hash route", () => {
		expect(
			parseDesktopWindowRoute("file:///app/index.html#/v2-workspace/ws-1/tab"),
		).toEqual({
			route: "/v2-workspace/ws-1/tab",
			view: "workspace",
			workspaceId: "ws-1",
		});
		expect(
			parseDesktopWindowRoute("http://localhost:5173/#/workspace/ws-2")
				.workspaceId,
		).toBe("ws-2");
	});

	test("tells a cloud workspace apart", () => {
		expect(
			parseDesktopWindowRoute("file:///index.html#/cloud-workspaces/cw-1"),
		).toMatchObject({ view: "cloud-workspace", workspaceId: "cw-1" });
	});

	test("a page that shows no workspace has none", () => {
		expect(parseDesktopWindowRoute("file:///index.html#/tasks")).toEqual({
			route: "/tasks",
			view: "other",
			workspaceId: null,
		});
		expect(parseDesktopWindowRoute("not a url").workspaceId).toBeNull();
		expect(
			parseDesktopWindowRoute("file:///index.html#/workspace/%E0%A4%A"),
		).toEqual({
			route: "/workspace/%E0%A4%A",
			view: "other",
			workspaceId: null,
		});
	});
});
