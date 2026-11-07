import { describe, expect, test } from "bun:test";
import { retryDelay } from "./retryDelay";

describe("retryDelay", () => {
	test("doubles after each failure, up to ten minutes", () => {
		expect(retryDelay(1)).toBe(30_000);
		expect(retryDelay(2)).toBe(60_000);
		expect(retryDelay(10)).toBe(600_000);
	});
});
