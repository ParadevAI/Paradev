import { expect, test } from "bun:test";
import {
	checkoutRepositoryFullNames,
	holdsExactRepositorySet,
	isSameRepositorySet,
	repositoryFullNames,
} from "./repositorySet";

test("isSameRepositorySet ignores order and case", () => {
	expect(isSameRepositorySet(["o/api", "o/web"], ["O/Web", "o/API"])).toBe(
		true,
	);
	expect(isSameRepositorySet(["o/api"], ["o/api", "o/web"])).toBe(false);
	expect(isSameRepositorySet(["o/api", "o/web"], ["o/api", "o/docs"])).toBe(
		false,
	);
});

test("repositoryFullNames skips repositories without a GitHub name", () => {
	expect(
		repositoryFullNames([
			{ owner: "o", repoName: "api" },
			{ owner: null, repoName: null },
		]),
	).toEqual(["o/api"]);
});

test("holdsExactRepositorySet refuses a project with an extra local-only repository", () => {
	const web = { owner: "o", repoName: "web" };
	const localOnly = { owner: null, repoName: null };
	expect(holdsExactRepositorySet([web], ["O/web"])).toBe(true);
	expect(holdsExactRepositorySet([web, localOnly], ["o/web"])).toBe(false);
});

test("checkoutRepositoryFullNames names the workspace's checkouts, not the project's repositories", () => {
	const repositories = [
		{ id: "r-api", owner: "o", repoName: "api" },
		{ id: "r-web", owner: "o", repoName: "web" },
		{ id: "r-added-later", owner: "o", repoName: "docs" },
	];
	expect(
		checkoutRepositoryFullNames(
			[{ repositoryId: "r-api" }, { repositoryId: "r-web" }],
			repositories,
		),
	).toEqual(["o/api", "o/web"]);
	expect(
		checkoutRepositoryFullNames(
			[{ repositoryId: "r-api" }, { repositoryId: "r-local" }],
			[...repositories, { id: "r-local", owner: null, repoName: null }],
		),
	).toBeNull();
	expect(checkoutRepositoryFullNames([], repositories)).toBeNull();
});
