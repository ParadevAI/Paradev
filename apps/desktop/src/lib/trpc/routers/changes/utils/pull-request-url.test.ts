import { describe, expect, test } from "bun:test";
import {
	buildPullRequestCompareUrl,
	normalizeGitHubRepoUrl,
	parseUpstreamRef,
} from "./pull-request-url";

describe("pull-request-url", () => {
	test("normalizes GitHub remote URLs", () => {
		expect(
			normalizeGitHubRepoUrl("https://github.com/superset-sh/superset.git"),
		).toBe("https://github.com/superset-sh/superset");
		expect(normalizeGitHubRepoUrl("git@github.com:Kitenite/superset.git")).toBe(
			"https://github.com/Kitenite/superset",
		);
		expect(
			normalizeGitHubRepoUrl("ssh://git@github.com/Kitenite/superset.git"),
		).toBe("https://github.com/Kitenite/superset");
		expect(
			normalizeGitHubRepoUrl("https://someone:ghp_x@github.com/acme/foo.git"),
		).toBe("https://github.com/acme/foo");
		expect(
			normalizeGitHubRepoUrl("https://example.com?next=@github.com/acme/foo"),
		).toBeNull();
	});

	test("parses upstream refs with slashes in branch names", () => {
		expect(parseUpstreamRef("kitenite/kitenite/halved-position")).toEqual({
			remoteName: "kitenite",
			branchName: "kitenite/halved-position",
		});
	});

	test("builds compare URLs for fork branches", () => {
		expect(
			buildPullRequestCompareUrl({
				baseRepoUrl: "https://github.com/superset-sh/superset.git",
				baseBranch: "main",
				headRepoOwner: "Kitenite",
				headBranch: "kitenite/halved-position",
			}),
		).toBe(
			"https://github.com/superset-sh/superset/compare/main...Kitenite:kitenite/halved-position?expand=1",
		);
	});
});
