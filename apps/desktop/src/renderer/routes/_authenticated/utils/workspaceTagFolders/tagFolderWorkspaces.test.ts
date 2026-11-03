import { describe, expect, test } from "bun:test";
import { mergeTagFolderWorkspaces } from "./tagFolderWorkspaces";

const PROJECT = "11111111-1111-4111-8111-111111111111";

describe("mergeTagFolderWorkspaces", () => {
	test("keeps host rows and drops the sandbox-served copy of a cloud row", () => {
		const merged = mergeTagFolderWorkspaces({
			hostWorkspaces: [
				{ id: "local", projectId: PROJECT, hostId: "machine", tags: ["a"] },
				{ id: "cloud", projectId: PROJECT, hostId: "sandbox", tags: [] },
			],
			isSandboxHost: (hostId) => hostId === "sandbox",
			cloudWorkspaces: [{ id: "cloud", tags: ["b"] }],
			placementProjectIdOf: () => PROJECT,
		});
		expect(merged).toEqual([
			{ id: "local", projectId: PROJECT, tags: ["a"] },
			{ id: "cloud", projectId: PROJECT, tags: ["b"] },
		]);
	});

	test("scopes a cloud row to its placement project", () => {
		const merged = mergeTagFolderWorkspaces({
			hostWorkspaces: [],
			isSandboxHost: () => false,
			cloudWorkspaces: [{ id: "cloud", tags: ["b"] }],
			placementProjectIdOf: () => PROJECT,
		});
		expect(merged).toEqual([{ id: "cloud", projectId: PROJECT, tags: ["b"] }]);
	});

	test("leaves out a cloud row that has no placement row yet", () => {
		const merged = mergeTagFolderWorkspaces({
			hostWorkspaces: [],
			isSandboxHost: () => false,
			cloudWorkspaces: [{ id: "cloud", tags: ["b"] }],
			placementProjectIdOf: () => undefined,
		});
		expect(merged).toEqual([]);
	});

	test("passes through a cloud row whose API sends no tags", () => {
		const merged = mergeTagFolderWorkspaces({
			hostWorkspaces: [],
			isSandboxHost: () => false,
			cloudWorkspaces: [{ id: "cloud" }],
			placementProjectIdOf: () => PROJECT,
		});
		expect(merged).toEqual([
			{ id: "cloud", projectId: PROJECT, tags: undefined },
		]);
	});
});
