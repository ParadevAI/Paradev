import { expect, test } from "bun:test";
import { pullRequestCheckoutInput } from "./pullRequestCheckoutInput";

test("names the PR by its repository when known", () => {
	expect(
		pullRequestCheckoutInput({
			prNumber: 4,
			repoFullName: "o/web",
			repositoryId: "web",
		}),
	).toEqual({ pullRequest: { repository: "o/web", number: 4 } });
});

test("falls back to the repository's checkout, then to nothing", () => {
	expect(
		pullRequestCheckoutInput({
			prNumber: 4,
			repoFullName: null,
			repositoryId: "web",
		}),
	).toEqual({ checkouts: { web: { pr: 4 } } });
	expect(
		pullRequestCheckoutInput({
			prNumber: 4,
			repoFullName: null,
			repositoryId: null,
		}),
	).toBeNull();
});
