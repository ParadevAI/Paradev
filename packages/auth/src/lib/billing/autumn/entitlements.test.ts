import { describe, expect, test } from "bun:test";
import { gatedMachineSizesFromFlags } from "./entitlements";

const on = { planId: null };

describe("gatedMachineSizesFromFlags", () => {
	test("a size above large is offered only while its Autumn feature is on", () => {
		expect(gatedMachineSizesFromFlags({ pro_access: on })).toEqual([]);
		expect(gatedMachineSizesFromFlags({ machine_size_xlarge: on })).toEqual([
			"xlarge",
		]);
		expect(gatedMachineSizesFromFlags(undefined)).toEqual([]);
	});
});
