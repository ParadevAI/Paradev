import { describe, expect, it } from "bun:test";
import { isForCheckout } from "./isForCheckout";

describe("isForCheckout", () => {
	it("matches only the checkout the event names", () => {
		expect(isForCheckout({ repositoryId: "api" }, "api")).toBe(true);
		expect(isForCheckout({ repositoryId: "web" }, "api")).toBe(false);
	});

	it("treats an event without a repository as about every checkout", () => {
		expect(isForCheckout({}, "api")).toBe(true);
		expect(isForCheckout({ repositoryId: null }, undefined)).toBe(true);
	});
});
