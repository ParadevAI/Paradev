import { describe, expect, test } from "bun:test";
import { guestCounts } from "./guestCounts";

describe("guestCounts", () => {
	test("counts each answer", () => {
		expect(
			guestCounts([
				{ response: "accepted" },
				{ response: "accepted" },
				{ response: "declined" },
				{ response: "tentative" },
				{ response: "needsAction" },
				{ response: "needsAction" },
			]),
		).toEqual({ total: 6, yes: 2, no: 1, maybe: 1, awaiting: 2 });
	});

	test("no guests is all zeros", () => {
		expect(guestCounts([])).toEqual({
			total: 0,
			yes: 0,
			no: 0,
			maybe: 0,
			awaiting: 0,
		});
	});
});
