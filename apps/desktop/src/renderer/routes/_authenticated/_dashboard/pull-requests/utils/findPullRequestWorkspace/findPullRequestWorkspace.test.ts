import { describe, expect, test } from "bun:test";
import {
	linkedWorkspaceInput,
	pullRequestWorkspaceQueryKey,
} from "./findPullRequestWorkspace";

describe("findPullRequestWorkspace", () => {
	test("names the repository by id when it is known", () => {
		expect(
			linkedWorkspaceInput({
				projectId: "p",
				prNumber: 7,
				repositoryId: "web",
				repoFullName: "o/web",
			}),
		).toEqual({ projectId: "p", prNumber: 7, repositoryId: "web" });
	});

	test("names the repository by its full name when the id is not known", () => {
		expect(
			linkedWorkspaceInput({
				projectId: "p",
				prNumber: 7,
				repositoryId: null,
				repoFullName: "o/web",
			}),
		).toEqual({ projectId: "p", prNumber: 7, repoFullName: "o/web" });
	});

	test("the same PR number in two repositories gets two query keys", () => {
		const lookup = { hostUrl: "h", projectId: "p", prNumber: 7 };
		expect(
			pullRequestWorkspaceQueryKey({ ...lookup, repoFullName: "o/web" }),
		).not.toEqual(
			pullRequestWorkspaceQueryKey({ ...lookup, repoFullName: "o/api" }),
		);
	});
});
