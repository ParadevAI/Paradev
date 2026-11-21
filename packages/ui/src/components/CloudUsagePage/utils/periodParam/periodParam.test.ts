import { expect, test } from "bun:test";
import { periodParam } from "./periodParam";

test("is the period id, except for the newest period", () => {
	const periods = [{ id: "2026-10-27" }, { id: "2026-09-27" }];
	expect(periodParam(periods, periods[1])).toBe("2026-09-27");
	expect(periodParam(periods, periods[0])).toBeUndefined();
	expect(periodParam(undefined, undefined)).toBeUndefined();
});
