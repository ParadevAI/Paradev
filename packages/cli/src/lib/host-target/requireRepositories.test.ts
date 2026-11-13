import { describe, expect, test } from "bun:test";
import { requireRepositories } from "./requireRepositories";

describe("requireRepositories", () => {
	test("returns the project's repositories", () => {
		expect(requireRepositories({ repositories: [{ id: "a" }] })).toEqual([
			{ id: "a" },
		]);
	});

	test("refuses a project from a host that predates repositories", () => {
		expect(() => requireRepositories({})).toThrow("too old");
	});
});
