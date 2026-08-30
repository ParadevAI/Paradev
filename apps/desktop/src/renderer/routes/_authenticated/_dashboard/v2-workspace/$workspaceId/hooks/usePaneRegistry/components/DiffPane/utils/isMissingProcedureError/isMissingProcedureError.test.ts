import { describe, expect, test } from "bun:test";
import { isMissingProcedureError } from "./isMissingProcedureError";

describe("isMissingProcedureError", () => {
	test("recognises a tRPC NOT_FOUND payload", () => {
		expect(isMissingProcedureError({ data: { code: "NOT_FOUND" } })).toBe(true);
	});

	test("recognises the message an older server sends", () => {
		expect(
			isMissingProcedureError(
				new Error('No procedure found on path "git.getDiffPatch"'),
			),
		).toBe(true);
	});

	test("leaves ordinary failures alone, so they still surface as errors", () => {
		expect(
			isMissingProcedureError(new Error("fatal: not a git repository")),
		).toBe(false);
		expect(
			isMissingProcedureError({ data: { code: "INTERNAL_SERVER_ERROR" } }),
		).toBe(false);
		expect(isMissingProcedureError(undefined)).toBe(false);
		expect(isMissingProcedureError("NOT_FOUND")).toBe(false);
	});
});
