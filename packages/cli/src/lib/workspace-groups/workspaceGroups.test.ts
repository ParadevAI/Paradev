import { describe, expect, test } from "bun:test";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import { resolveGroupTag, workspaceGroupNames } from "./workspaceGroups";

const PROJECT = "project-1";

function resolve(
	name: string,
	{
		workspaces = [],
		settings = [],
		scope = PROJECT,
	}: {
		workspaces?: Array<{ projectId: string | null; tags: string[] }>;
		settings?: Array<{
			scope: string;
			tag: string;
			displayName: string | null;
		}>;
		scope?: string;
	} = {},
) {
	return resolveGroupTag({ name, scope, workspaces, settings });
}

describe("resolveGroupTag", () => {
	test("matches a renamed group by the name the desktop shows", () => {
		expect(
			resolve("sales", {
				workspaces: [{ projectId: PROJECT, tags: ["new group"] }],
				settings: [{ scope: PROJECT, tag: "new group", displayName: "Sales" }],
			}),
		).toEqual({ tag: "new group", isNew: false });
	});

	test("matches a group with no shown name by its tag", () => {
		expect(
			resolve(" Bugs ", {
				workspaces: [{ projectId: PROJECT, tags: ["bugs"] }],
			}),
		).toEqual({ tag: "bugs", isNew: false });
	});

	test("does not match a renamed group by its old name, and mints a free tag", () => {
		expect(
			resolve("Review", {
				workspaces: [{ projectId: PROJECT, tags: ["review"] }],
				settings: [{ scope: PROJECT, tag: "review", displayName: "Old stuff" }],
			}),
		).toEqual({ tag: "review-2", isNew: true });
	});

	test("ignores groups in other projects and in the sessions lane", () => {
		expect(
			resolve("Review", {
				workspaces: [
					{ projectId: "project-2", tags: ["review"] },
					{ projectId: null, tags: ["review"] },
				],
			}),
		).toEqual({ tag: "review", isNew: true });
	});

	test("finds sessions-lane groups under the sessions scope", () => {
		expect(
			resolve("scratch", {
				scope: SESSIONS_TAG_SCOPE,
				workspaces: [{ projectId: null, tags: ["scratch"] }],
			}),
		).toEqual({ tag: "scratch", isNew: false });
	});

	test("errors when two groups show the same name", () => {
		expect(() =>
			resolve("Review", {
				workspaces: [{ projectId: PROJECT, tags: ["review", "new group"] }],
				settings: [{ scope: PROJECT, tag: "new group", displayName: "Review" }],
			}),
		).toThrow(/Several groups are named "Review"/);
	});
});

describe("workspaceGroupNames", () => {
	test("shows a renamed group's name and an unrenamed group's tag", () => {
		expect(
			workspaceGroupNames({ projectId: PROJECT, tags: ["new group", "bugs"] }, [
				{ scope: PROJECT, tag: "new group", displayName: "Sales" },
				{ scope: "project-2", tag: "bugs", displayName: "Elsewhere" },
			]),
		).toEqual(["bugs", "Sales"]);
	});
});
