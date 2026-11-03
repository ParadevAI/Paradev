import { describe, expect, test } from "bun:test";
import { appRouter } from "../../root";
import { SANDBOX_ALLOWED_PROCEDURES } from "./api-credential";

describe("SANDBOX_ALLOWED_PROCEDURES", () => {
	test("names only procedures the router has", () => {
		const procedures = new Set(Object.keys(appRouter._def.procedures));
		const unknown = [...SANDBOX_ALLOWED_PROCEDURES].filter(
			(path) => !procedures.has(path),
		);
		expect(unknown).toEqual([]);
	});
});
