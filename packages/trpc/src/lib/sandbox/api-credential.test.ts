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

	test("never lets a box open a host to itself", () => {
		expect(SANDBOX_ALLOWED_PROCEDURES.has("host.setCloudWorkspaceAccess")).toBe(
			false,
		);
		expect(SANDBOX_ALLOWED_PROCEDURES.has("host.ensure")).toBe(false);
	});

	test("lets a box update automation settings and prompts", () => {
		for (const path of [
			"automation.get",
			"automation.getPrompt",
			"automation.setEnabled",
			"automation.setGroup",
			"automation.setPrompt",
			"automation.update",
		]) {
			expect(SANDBOX_ALLOWED_PROCEDURES.has(path)).toBe(true);
		}
	});
});
