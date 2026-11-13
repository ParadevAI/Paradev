import { describe, expect, test } from "bun:test";
import { recordedBaseBranches } from "./start";

const REPOSITORIES = [{ id: "r-api" }, { id: "r-web" }];
const BASE = {
	repositories: REPOSITORIES,
	primaryRepositoryId: "r-web",
	branch: "superset/teleport-1",
	repositoryBaseBranches: undefined,
};
const MOVED = { branch: "superset/teleport-1", required: true };

describe("recordedBaseBranches", () => {
	test("a plain start records no base, so every checkout falls back as before", () => {
		expect(recordedBaseBranches({ ...BASE, move: undefined })).toEqual({});
	});

	test("an automation's base is recorded but not required, and only for the environment's repositories", () => {
		expect(
			recordedBaseBranches({
				...BASE,
				branch: undefined,
				repositoryBaseBranches: { "r-api": "feature", "r-gone": "x" },
				move: undefined,
			}),
		).toEqual({ "r-api": { branch: "feature", required: false } });
	});

	test("a move from an older client requires its branch on the primary only", () => {
		expect(recordedBaseBranches({ ...BASE, move: {} })).toEqual({
			"r-web": MOVED,
		});
	});

	test("a move that names its repositories requires its branch on every one", () => {
		expect(
			recordedBaseBranches({
				...BASE,
				move: { repositories: ["acme/api", "acme/web"] },
			}),
		).toEqual({ "r-api": MOVED, "r-web": MOVED });
	});
});
