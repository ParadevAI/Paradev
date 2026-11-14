import { expect, test } from "bun:test";
import { workspacesFolderOf } from "./workspacesFolderOf";

test("drops the whole branch name, slashes included", () => {
	expect(
		workspacesFolderOf(
			"/home/me/.paradev/worktrees/orbit/feature/foo",
			"feature/foo",
		),
	).toBe("/home/me/.paradev/worktrees/orbit");
	expect(workspacesFolderOf("/w/orbit/main/", "main")).toBe("/w/orbit");
	expect(workspacesFolderOf("C:\\w\\orbit\\feature\\foo", "feature/foo")).toBe(
		"C:\\w\\orbit",
	);
});

test("a root that does not end with its branch gives no folder", () => {
	expect(workspacesFolderOf("/w/orbit/renamed", "feature/foo")).toBeUndefined();
	expect(workspacesFolderOf("/w/orbit/foo", "feature/foo")).toBeUndefined();
});
