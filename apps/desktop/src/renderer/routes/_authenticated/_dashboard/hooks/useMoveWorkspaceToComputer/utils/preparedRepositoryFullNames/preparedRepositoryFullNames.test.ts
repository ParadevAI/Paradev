import { expect, test } from "bun:test";
import { preparedRepositoryFullNames } from "./preparedRepositoryFullNames";

test("names every pushed snapshot", () => {
	expect(
		preparedRepositoryFullNames({
			snapshots: [
				{ repositoryFullName: "o/api" },
				{ repositoryFullName: "o/web" },
			],
		}),
	).toEqual(["o/api", "o/web"]);
});

test("reads the one repository of a box made before multi-repo workspaces", () => {
	expect(
		preparedRepositoryFullNames({ repositoryFullName: "o/api" } as never),
	).toEqual(["o/api"]);
});

test("gives null when the host names no repository", () => {
	expect(preparedRepositoryFullNames({})).toBeNull();
});
