import { describe, expect, it } from "bun:test";
import { toggledRepositoryIds } from "./toggledRepositoryIds";

describe("toggledRepositoryIds", () => {
	it("picks only the toggled repository while all are shown", () => {
		expect(toggledRepositoryIds(3, new Set(["a", "b", "c"]), "b")).toEqual([
			"b",
		]);
	});

	it("adds and removes a repository from a partial pick", () => {
		expect(toggledRepositoryIds(3, new Set(["a"]), "b")).toEqual(["a", "b"]);
		expect(toggledRepositoryIds(3, new Set(["a", "b"]), "a")).toEqual(["b"]);
	});

	it("goes back to every repository when the pick covers all or none", () => {
		expect(toggledRepositoryIds(3, new Set(["a", "b"]), "c")).toEqual([]);
		expect(toggledRepositoryIds(3, new Set(["a"]), "a")).toEqual([]);
	});
});
