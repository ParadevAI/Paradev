import { describe, expect, test } from "bun:test";
import { proSeatPriceValues } from "./proSeatPriceValues";

describe("proSeatPriceValues", () => {
	test("formats the shared Pro seat price per cadence", () => {
		expect(proSeatPriceValues("en")).toEqual({
			monthlyPrice: "$20",
			yearlyPrice: "$15",
			yearlyTotal: "$180",
		});
	});
});
