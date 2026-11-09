import { describe, expect, test } from "bun:test";
import { newestWins } from "./newestWins";

describe("newestWins", () => {
	test("drops an older result that settles after a newer one was accepted", () => {
		const order = newestWins();
		const older = order.issue();
		const newer = order.issue();
		expect(order.accept(newer)).toBe(true);
		expect(order.accept(older)).toBe(false);
	});

	test("still accepts an older result when the newer call failed", () => {
		const order = newestWins();
		const older = order.issue();
		order.issue();
		expect(order.accept(older)).toBe(true);
	});
});
