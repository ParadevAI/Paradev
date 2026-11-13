import { describe, expect, test } from "bun:test";
import { pullRequestBases } from "./cloudDispatch";

const REPOSITORIES = [
	{ id: "r-api", repoId: "101", fullName: "acme/api" },
	{ id: "r-web", repoId: "102", fullName: "acme/web" },
];
const ARGS = {
	repositories: REPOSITORIES,
	primaryRepositoryId: "r-web",
	headRef: "fix-login",
};

describe("pullRequestBases", () => {
	test("a pull request on the primary is the workspace's base branch", () => {
		expect(pullRequestBases({ ...ARGS, eventRepositoryId: "102" })).toEqual({
			branch: "fix-login",
		});
	});

	test("a pull request on another repository is that repository's base only", () => {
		expect(pullRequestBases({ ...ARGS, eventRepositoryId: "101" })).toEqual({
			repositoryBaseBranches: { "r-api": "fix-login" },
		});
	});

	test("a pull request on a repository outside the environment changes no base", () => {
		expect(pullRequestBases({ ...ARGS, eventRepositoryId: "999" })).toEqual({});
	});
});
