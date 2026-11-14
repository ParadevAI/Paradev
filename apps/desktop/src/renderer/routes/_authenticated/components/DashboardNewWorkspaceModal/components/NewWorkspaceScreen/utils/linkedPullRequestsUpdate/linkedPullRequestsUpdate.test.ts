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
const noPicks: string[] = [];

describe("linkedPullRequestsUpdate", () => {
	test("applies the lookup of a new linked PR", () => {
		expect(
			linkedPullRequestsUpdate({
				linkedPRUrl: NEW,
				appliedFor: OLD,
				found,
				pickedRepositoryIds: noPicks,
			}),
		).toEqual({ checkoutPullRequests: found, checkoutPullRequestsFor: NEW });
	});

	test("leaves out repositories picked while the lookup ran", () => {
		const web = { ...found.api, url: "https://github.com/o/web/pull/3" };
		expect(
			linkedPullRequestsUpdate({
				linkedPRUrl: NEW,
				appliedFor: null,
				found: { ...found, web },
				pickedRepositoryIds: ["api"],
			}),
		).toEqual({ checkoutPullRequests: { web }, checkoutPullRequestsFor: NEW });
	});

	test("drops the old PR's picks while the new one is not found", () => {
		for (const missing of [null, undefined]) {
			expect(
				linkedPullRequestsUpdate({
					linkedPRUrl: NEW,
					appliedFor: OLD,
					found: missing,
					pickedRepositoryIds: noPicks,
				}),
			).toEqual({ checkoutPullRequests: {}, checkoutPullRequestsFor: null });
		}
	});

	test("drops the picks when the PR link is removed", () => {
		expect(
			linkedPullRequestsUpdate({
				linkedPRUrl: null,
				appliedFor: OLD,
				found,
				pickedRepositoryIds: noPicks,
			}),
		).toEqual({ checkoutPullRequests: {}, checkoutPullRequestsFor: null });
	});

	test("changes nothing once applied or with nothing to drop", () => {
		expect(
			linkedPullRequestsUpdate({
				linkedPRUrl: NEW,
				appliedFor: NEW,
				found,
				pickedRepositoryIds: noPicks,
			}),
		).toBeNull();
		expect(
			linkedPullRequestsUpdate({
				linkedPRUrl: NEW,
				appliedFor: null,
				found: null,
				pickedRepositoryIds: noPicks,
			}),
		).toBeNull();
	});
});
