import { expect, test } from "bun:test";
import { failedRepositoryIdsOf } from "./failedRepositoryIdsOf";

test("names only the checkouts whose changes failed to load, in repository order", () => {
	expect(
		failedRepositoryIdsOf(["repo-web", "repo-api", "repo-docs"], {
			"repo-api": { isError: true },
			"repo-web": { isError: false },
		}),
	).toEqual(["repo-api"]);
});
