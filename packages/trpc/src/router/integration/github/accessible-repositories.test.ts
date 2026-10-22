import { describe, expect, test } from "bun:test";
import { filterReachable } from "./accessible-repositories";

describe("filterReachable", () => {
	test("keeps public repositories and only the private ones the person reaches", () => {
		const repositories = [
			{ repoId: "1", isPrivate: false },
			{ repoId: "2", isPrivate: true },
			{ repoId: "3", isPrivate: true },
		];
		expect(filterReachable(repositories, new Set(["3"]))).toEqual([
			{ repoId: "1", isPrivate: false },
			{ repoId: "3", isPrivate: true },
		]);
		expect(filterReachable(repositories, new Set())).toEqual([
			{ repoId: "1", isPrivate: false },
		]);
	});
});
