import { expect, test } from "bun:test";
import { checkoutForPullRequest } from "./checkoutForPullRequest";

test("finds the checkout that links the pull request on screen", () => {
	const checkouts = [
		{ id: "web", pullRequestUrl: "https://github.com/acme/web/pull/7" },
		{ id: "api", pullRequestUrl: "https://github.com/acme/api/pull/7" },
		{ id: "shared", pullRequestUrl: null },
	];

	expect(
		checkoutForPullRequest(checkouts, { repoFullName: "Acme/API", number: 7 }),
	).toBe("api");
	expect(
		checkoutForPullRequest(checkouts, { repoFullName: "acme/api", number: 8 }),
	).toBeNull();
});
