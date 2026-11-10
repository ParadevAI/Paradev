import { describe, expect, test } from "bun:test";
import { waitsForLocalHost } from "./waitsForLocalHost";

describe("waitsForLocalHost", () => {
	test("a service that is starting or just came up is waited for", () => {
		for (const hostServiceStatus of ["starting", "running"] as const) {
			expect(waitsForLocalHost({ hostServiceStatus, graceElapsed: true })).toBe(
				true,
			);
		}
	});

	test("a stopped or silent service is waited for only during the grace period", () => {
		for (const hostServiceStatus of ["stopped", "unknown"] as const) {
			expect(
				waitsForLocalHost({ hostServiceStatus, graceElapsed: false }),
			).toBe(true);
			expect(waitsForLocalHost({ hostServiceStatus, graceElapsed: true })).toBe(
				false,
			);
		}
	});
});
