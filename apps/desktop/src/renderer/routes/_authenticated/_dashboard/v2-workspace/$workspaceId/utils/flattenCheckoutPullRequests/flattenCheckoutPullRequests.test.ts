import { expect, test } from "bun:test";
import { flattenCheckoutPullRequests } from "./flattenCheckoutPullRequests";

test("tags each pull request with the repository that links it", () => {
	expect(
		flattenCheckoutPullRequests([
			{ repositoryId: "api", pullRequests: [{ number: 1 }] },
			{ repositoryId: "web", pullRequests: [{ number: 1 }, { number: 2 }] },
		]),
	).toEqual([
		{ number: 1, repositoryId: "api" },
		{ number: 1, repositoryId: "web" },
		{ number: 2, repositoryId: "web" },
	]);
	expect(flattenCheckoutPullRequests(undefined)).toEqual([]);
});
