import { describe, expect, test } from "bun:test";
import { linkedPullRequestsUpdate } from "./linkedPullRequestsUpdate";

const OLD = "https://github.com/o/api/pull/1";
const NEW = "https://github.com/o/api/pull/2";
const found = {
	api: {
		prNumber: 2,
		title: "Two",
		url: NEW,
		state: "open",
		headRefName: "two",
		matched: false,
	},
};

describe("linkedPullRequestsUpdate", () => {
	test("applies the lookup of a new linked PR", () => {
		expect(
			linkedPullRequestsUpdate({ linkedPRUrl: NEW, appliedFor: OLD, found }),
		).toEqual({ checkoutPullRequests: found, checkoutPullRequestsFor: NEW });
	});

	test("drops the old PR's picks while the new one is not found", () => {
		for (const missing of [null, undefined]) {
			expect(
				linkedPullRequestsUpdate({
					linkedPRUrl: NEW,
					appliedFor: OLD,
					found: missing,
				}),
			).toEqual({ checkoutPullRequests: {}, checkoutPullRequestsFor: null });
		}
	});

	test("drops the picks when the PR link is removed", () => {
		expect(
			linkedPullRequestsUpdate({ linkedPRUrl: null, appliedFor: OLD, found }),
		).toEqual({ checkoutPullRequests: {}, checkoutPullRequestsFor: null });
	});

	test("changes nothing once applied or with nothing to drop", () => {
		expect(
			linkedPullRequestsUpdate({ linkedPRUrl: NEW, appliedFor: NEW, found }),
		).toBeNull();
		expect(
			linkedPullRequestsUpdate({
				linkedPRUrl: NEW,
				appliedFor: null,
				found: null,
			}),
		).toBeNull();
	});
});
