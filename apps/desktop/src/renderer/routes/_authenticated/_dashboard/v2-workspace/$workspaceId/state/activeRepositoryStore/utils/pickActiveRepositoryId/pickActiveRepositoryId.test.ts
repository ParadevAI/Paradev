import { describe, expect, it } from "bun:test";
import { pickActiveRepositoryId } from "./pickActiveRepositoryId";

const checkouts = [
	{ repositoryId: "api", isPrimary: false },
	{ repositoryId: "web", isPrimary: true },
];

describe("pickActiveRepositoryId", () => {
	it("keeps the picked repository", () => {
		expect(pickActiveRepositoryId(checkouts, "api")).toBe("api");
	});

	it("falls back to the primary when the pick is gone or unset", () => {
		expect(pickActiveRepositoryId(checkouts, "removed")).toBe("web");
		expect(pickActiveRepositoryId(checkouts, null)).toBe("web");
	});

	it("is undefined without checkouts", () => {
		expect(pickActiveRepositoryId([], "api")).toBeUndefined();
	});
});
