import { expect, test } from "bun:test";

import { toDate, toDay } from "./days";

test("a day string survives a round trip through the date of the calendar", () => {
	expect(toDay(toDate("2026-03-08"))).toBe("2026-03-08");
});
