import { describe, expect, it } from "bun:test";
import { shownRepositoryIds } from "./shownRepositoryIds";

describe("shownRepositoryIds", () => {
	it("shows every repository when none is picked", () => {
		expect(shownRepositoryIds(["web", "api"], undefined)).toEqual(
			new Set(["web", "api"]),
		);
	});

	it("shows only the picked repositories", () => {
		expect(shownRepositoryIds(["web", "api", "shared"], ["api"])).toEqual(
			new Set(["api"]),
		);
	});

	it("falls back to every repository when the picked ones are gone", () => {
		expect(shownRepositoryIds(["web", "api"], ["removed"])).toEqual(
			new Set(["web", "api"]),
		);
	});
});
