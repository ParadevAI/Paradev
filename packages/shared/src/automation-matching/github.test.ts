import { describe, expect, it } from "bun:test";
import { githubEventNames } from "./github";

const names = (
	eventType: string,
	overrides: Partial<Parameters<typeof githubEventNames>[0]> = {},
) =>
	githubEventNames({
		eventType,
		isDraft: false,
		isMerged: false,
		isPullRequestComment: false,
		reviewState: null,
		runConclusion: null,
		...overrides,
	});

describe("githubEventNames", () => {
	it("names a closed pull request merged only when it was merged", () => {
		expect(names("pull_request.closed", { isMerged: true })).toEqual([
			"pull_request.merged",
		]);
		expect(names("pull_request.closed")).toEqual([]);
	});

	it("keeps issue comments and pull request comments apart", () => {
		expect(names("issue_comment.created")).toEqual(["issue_comment"]);
		expect(
			names("issue_comment.created", { isPullRequestComment: true }),
		).toEqual(["comment_added"]);
	});

	it("counts a review comment as a pull request comment", () => {
		expect(names("pull_request_review_comment.created")).toEqual([
			"pr_review_comment",
			"comment_added",
		]);
	});
});
