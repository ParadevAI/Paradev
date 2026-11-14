import { describe, expect, it } from "bun:test";
import { importedV1WorkspaceCheck } from "./importedV1WorkspaceCheck";

describe("importedV1WorkspaceCheck", () => {
	const isImported = importedV1WorkspaceCheck([
		{
			projectId: "multi",
			branch: "feature",
			checkouts: [{ repositoryId: "repo-api" }],
		},
		{ projectId: "single", branch: "main", checkouts: [] },
		{ projectId: null, branch: "feature", checkouts: [] },
	]);

	it("keeps a multi-repo sibling on the same branch pending until its repository is in", () => {
		expect(
			isImported({
				v2ProjectId: "multi",
				repositoryId: "repo-api",
				multiRepo: true,
				branch: "feature",
			}),
		).toBe(true);
		expect(
			isImported({
				v2ProjectId: "multi",
				repositoryId: "repo-web",
				multiRepo: true,
				branch: "feature",
			}),
		).toBe(false);
	});

	it("matches a single-repo project on its branch alone", () => {
		expect(
			isImported({
				v2ProjectId: "single",
				repositoryId: "repo-x",
				multiRepo: false,
				branch: "main",
			}),
		).toBe(true);
		expect(
			isImported({
				v2ProjectId: "single",
				repositoryId: "repo-x",
				multiRepo: false,
				branch: "other",
			}),
		).toBe(false);
	});
});
