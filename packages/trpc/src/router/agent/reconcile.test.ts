import { describe, expect, test } from "bun:test";
import { eachApart } from "./reconcile";

describe("eachApart", () => {
	test("a repair that throws does not stop the repairs after it", async () => {
		const repaired: number[] = [];
		const failed: [number, unknown][] = [];

		await eachApart(
			[1, 2, 3],
			async (item) => {
				if (item === 2) throw new Error("boom");
				repaired.push(item);
			},
			(item, error) => failed.push([item, error]),
		);

		expect(repaired).toEqual([1, 3]);
		expect(failed).toEqual([[2, new Error("boom")]]);
	});
});
