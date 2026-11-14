import { expect, test } from "bun:test";
import { pickShowingRepository } from "./pickShowingRepository";

const repositoryIds = ["api", "web", "docs"];

test("adds a hidden repository to the pick and keeps the others", () => {
	expect(
		pickShowingRepository(repositoryIds, new Set(["docs"]), "api"),
	).toEqual(["api", "docs"]);
});

test("leaves the pick when the repository is shown or unknown", () => {
	expect(
		pickShowingRepository(repositoryIds, new Set(["api"]), "api"),
	).toBeNull();
	expect(
		pickShowingRepository(repositoryIds, new Set(["api"]), "gone"),
	).toBeNull();
	expect(
		pickShowingRepository(repositoryIds, new Set(["api"]), undefined),
	).toBeNull();
});

test("shows every repository once the pick covers them all", () => {
	expect(
		pickShowingRepository(["api", "web"], new Set(["web"]), "api"),
	).toEqual([]);
});
