import { describe, expect, it } from "bun:test";
import { groupByTagFolder } from "./groupByTagFolder";

const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ws = (id: string, tags: string[] = []) => ({ id, tags });

describe("groupByTagFolder", () => {
	it("puts ungrouped workspaces first and keeps input order in each group", () => {
		const result = groupByTagFolder(
			PROJECT,
			[ws("a", ["fix"]), ws("b"), ws("c", ["fix"]), ws("d")],
			[],
		);
		expect(result.ungrouped.map((w) => w.id)).toEqual(["b", "d"]);
		expect(
			result.folders.map((f) => [f.name, f.workspaces.map((w) => w.id)]),
		).toEqual([["fix", ["a", "c"]]]);
	});

	it("uses the host's folder name, color and order", () => {
		const result = groupByTagFolder(
			PROJECT,
			[ws("a", ["alpha"]), ws("b", ["beta"])],
			[
				{ projectId: PROJECT, tag: "beta", displayName: "Beta", tabOrder: 1 },
				{ projectId: PROJECT, tag: "alpha", color: "#ff0000", tabOrder: 2 },
			],
		);
		expect(result.folders.map((f) => [f.name, f.color])).toEqual([
			["Beta", null],
			["alpha", "#ff0000"],
		]);
	});

	it("places a workspace with two folder tags in one folder only", () => {
		const result = groupByTagFolder(PROJECT, [ws("a", ["b-tag", "a-tag"])], []);
		expect(result.folders.map((f) => f.name)).toEqual(["a-tag"]);
	});

	it("ignores settings for another project", () => {
		const result = groupByTagFolder(
			PROJECT,
			[ws("a", ["fix"])],
			[{ projectId: "other", tag: "fix", displayName: "Other" }],
		);
		expect(result.folders.map((f) => f.name)).toEqual(["fix"]);
	});

	it("lists every group tag, including groups with no shown workspace", () => {
		const result = groupByTagFolder(
			PROJECT,
			[ws("a", ["fix", "later"]), ws("b", ["fix"])],
			[{ projectId: PROJECT, tag: "fix", tabOrder: 1 }],
		);
		expect(result.folders.map((f) => f.tag)).toEqual(["fix"]);
		expect(result.folderTags.sort()).toEqual(["fix", "later"]);
	});
});
