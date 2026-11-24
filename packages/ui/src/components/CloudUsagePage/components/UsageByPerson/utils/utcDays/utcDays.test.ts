import { describe, expect, it } from "bun:test";
import { utcDays } from "./utcDays";

describe("utcDays", () => {
	it("lists each UTC day the window touches, end exclusive", () => {
		expect(
			utcDays({
				from: new Date("2026-10-30T15:00:00Z"),
				to: new Date("2026-11-02T00:00:00Z"),
			}),
		).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
	});
});
