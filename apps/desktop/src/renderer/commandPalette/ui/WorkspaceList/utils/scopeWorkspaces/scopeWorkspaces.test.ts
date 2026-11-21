import { describe, expect, test } from "bun:test";
import { scopeWorkspaces } from "./scopeWorkspaces";

const ROWS = [
	{ id: "mine", isInSidebar: true, createdByName: "Avi Peltz" },
	{ id: "hidden", isInSidebar: false, createdByName: "Avi Peltz" },
	{ id: "theirs", isInSidebar: false, createdByName: "Harshith Rao" },
	{ id: "here", isInSidebar: false, createdByName: null },
];

describe("scopeWorkspaces", () => {
	test("the sidebar scope keeps sidebar rows and the current one", () => {
		expect(
			scopeWorkspaces(ROWS, { scope: "sidebar", creator: null }, "here").map(
				(row) => row.id,
			),
		).toEqual(["mine", "here"]);
	});

	test("# reaches every workspace", () => {
		expect(
			scopeWorkspaces(ROWS, { scope: "all", creator: null }, null),
		).toHaveLength(4);
	});

	test("#name keeps one person's workspaces wherever they are", () => {
		expect(
			scopeWorkspaces(ROWS, { scope: "all", creator: "har" }, "mine").map(
				(row) => row.id,
			),
		).toEqual(["theirs"]);
	});
});
