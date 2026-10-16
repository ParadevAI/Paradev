import { describe, expect, test } from "bun:test";
import { offerText } from "./offerText";

describe("offerText", () => {
	test("puts the times under the reply after a blank line", () => {
		expect(offerText("Any of these work?\n", ["Tue 10:00", "Wed 9:00"])).toBe(
			"Any of these work?\n\nTue 10:00\nWed 9:00",
		);
	});

	test("an empty reply sends the times alone", () => {
		expect(offerText("  ", ["Tue 10:00"])).toBe("Tue 10:00");
	});
});
