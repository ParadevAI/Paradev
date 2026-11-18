import { expect, test } from "bun:test";
import { allowanceNotes } from "./allowanceNotes";

test("one note per reason; a percentage cap covers its untracked limit", () => {
	expect(
		allowanceNotes([
			{ field: "seats", reason: "not_read" },
			{ field: "bought", reason: "not_read" },
			{ field: "limitReached", reason: "not_read" },
		]),
	).toEqual(["not_read"]);
	expect(
		allowanceNotes([
			{ field: "extraUsageLimit", reason: "percent_of_allowance" },
			{ field: "limitReached", reason: "not_tracked" },
		]),
	).toEqual(["percent_of_allowance"]);
	expect(
		allowanceNotes([{ field: "limitReached", reason: "not_tracked" }]),
	).toEqual(["not_tracked"]);
	expect(
		allowanceNotes([{ field: "allowance", reason: "closed_period" }]),
	).toEqual(["closed_period"]);
	expect(
		allowanceNotes([{ field: "allowance", reason: "owners_and_admins_only" }]),
	).toEqual([]);
});
