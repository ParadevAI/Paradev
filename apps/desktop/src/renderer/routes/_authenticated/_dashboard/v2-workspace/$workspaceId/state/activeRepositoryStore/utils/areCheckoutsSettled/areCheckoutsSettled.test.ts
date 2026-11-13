import { expect, test } from "bun:test";
import { areCheckoutsSettled } from "./areCheckoutsSettled";

test("a failed workspace read counts as settled", () => {
	expect(areCheckoutsSettled({ data: undefined, isError: true })).toBe(true);
	expect(areCheckoutsSettled({ data: undefined, isError: false })).toBe(false);
});
