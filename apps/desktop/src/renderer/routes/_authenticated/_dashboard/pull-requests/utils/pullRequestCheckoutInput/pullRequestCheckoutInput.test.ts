import { expect, test } from "bun:test";
import { pullRequestCheckoutInput } from "./pullRequestCheckoutInput";

test("starts the PR in the repository's checkout when the repository is known", () => {
	expect(
		pullRequestCheckoutInput({
			prNumber: 4,
			repoFullName: "o/web",
			repositoryId: "web",
		}),
	).toEqual({ checkouts: { web: { pr: 4 } } });
});

test("falls back to the repository's GitHub name, then to nothing", () => {
	expect(
		pullRequestCheckoutInput({
			prNumber: 4,
			repoFullName: "o/web",
			repositoryId: null,
		}),
	).toEqual({ pullRequest: { repository: "o/web", number: 4 } });
	expect(
		pullRequestCheckoutInput({
			prNumber: 4,
			repoFullName: null,
			repositoryId: null,
		}),
	).toBeNull();
});
