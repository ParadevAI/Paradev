import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveScreenshotsDir } from "./screenshots-dir";

describe("resolveScreenshotsDir", () => {
	test("a machine with no screenshots folder gets the Paradev one", () => {
		expect(resolveScreenshotsDir("/pics", () => false)).toBe(
			join("/pics", "Paradev Screenshots"),
		);
	});

	test("an existing Superset folder stays in use", () => {
		const legacy = join("/pics", "Superset Screenshots");
		expect(resolveScreenshotsDir("/pics", (path) => path === legacy)).toBe(
			legacy,
		);
	});
});
