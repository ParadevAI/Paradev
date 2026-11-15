import { describe, expect, test } from "bun:test";
import { billingLinksAllowed } from "./billingLinksAllowed";
import { isUsStorefront } from "./isUsStorefront";

describe("billingLinksAllowed", () => {
	test("only the US storefront counts as the US", () => {
		expect(isUsStorefront("USA")).toBe(true);
		expect(isUsStorefront("GBR")).toBe(false);
		expect(isUsStorefront("usa")).toBe(false);
		expect(isUsStorefront(null)).toBe(false);
	});

	test("a store build without a storefront check never links out", async () => {
		expect(await billingLinksAllowed()).toBe(false);
	});
});
