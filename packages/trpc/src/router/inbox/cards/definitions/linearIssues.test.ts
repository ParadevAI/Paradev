import { describe, expect, test } from "bun:test";
import { CardUnavailable } from "../types";
import { linearFailure } from "./linearClient";
import { estimateScale, ISSUE_REF, writeId } from "./linearIssues";

const scale = (type: string, allowZero = false, extended = false) =>
	estimateScale({
		issueEstimationType: type,
		issueEstimationAllowZero: allowZero,
		issueEstimationExtended: extended,
	});

describe("estimateScale", () => {
	test("a team that does not estimate offers nothing", () => {
		expect(scale("notUsed")).toEqual([]);
	});

	test("fibonacci in points, as Linear words them", () => {
		expect(scale("fibonacci").map((estimate) => estimate.label)).toEqual([
			"1 Point",
			"2 Points",
			"3 Points",
			"5 Points",
			"8 Points",
		]);
	});

	test("zero and the extended values are added when the team allows them", () => {
		expect(
			scale("exponential", true, true).map((estimate) => estimate.value),
		).toEqual([0, 1, 2, 4, 8, 16, 32, 64]);
	});

	test("T-shirt sizes are named, with their point values underneath", () => {
		expect(scale("tShirt", false, true)).toEqual([
			{ value: 1, label: "XS" },
			{ value: 2, label: "S" },
			{ value: 3, label: "M" },
			{ value: 5, label: "L" },
			{ value: 8, label: "XL" },
			{ value: 13, label: "XXL" },
			{ value: 21, label: "XXXL" },
		]);
	});
});

describe("writeId", () => {
	const ctx = { readerId: "reader", organizationId: "org" };
	const UUID_V4 =
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

	test("is a version 4 uuid, the same for the same text and different for another", () => {
		const first = writeId(ctx, ["issue", "", "Same words"]);
		expect(first).toMatch(UUID_V4);
		expect(writeId(ctx, ["issue", "", "Same words"])).toBe(first);
		expect(writeId(ctx, ["issue", "", "Other words"])).not.toBe(first);
		expect(writeId(ctx, ["issue", "parent", "Same words"])).not.toBe(first);
	});
});

describe("ISSUE_REF", () => {
	test("takes an identifier or an id, nothing with a path or a query in it", () => {
		expect(ISSUE_REF.test("AGT-12")).toBe(true);
		expect(ISSUE_REF.test("0f7440b0-5c6d-40f5-ad61-9fbadc6ef17c")).toBe(true);
		expect(ISSUE_REF.test("AGT-12/../x")).toBe(false);
		expect(ISSUE_REF.test('AGT-1") { id } }')).toBe(false);
	});
});

describe("linearFailure", () => {
	const failure = (type: string, message: string, userError = false) => ({
		type,
		message,
		errors: [{ type, message, userError }],
	});

	test("a missing issue is gone; a refusal is no access; a rate limit says to wait", () => {
		expect(
			linearFailure(failure("InvalidInput", "Could not find referenced Issue."))
				?.state,
		).toBe("gone");
		expect(
			linearFailure(failure("InvalidInput", "Entity not found: Issue"))?.state,
		).toBe("gone");
		expect(linearFailure(failure("Forbidden", "no"))?.state).toBe("no_access");
		expect(linearFailure(failure("Ratelimited", "slow down"))?.text).toBe(
			"Linear is limiting requests. Try again in a minute",
		);
	});

	test("Linear's own sentence for the reader is passed on; anything else is left to the caller", () => {
		const shown = linearFailure(
			failure("InvalidInput", "Only one label per group.", true),
		);
		expect(shown).toBeInstanceOf(CardUnavailable);
		expect(shown?.text).toBe("Only one label per group.");
		expect(linearFailure(failure("Other", "internal detail"))).toBeNull();
		expect(linearFailure(new Error("socket hang up"))).toBeNull();
	});
});
