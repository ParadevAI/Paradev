import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextPatch, replaceVersion } from "./submit-review";

describe("nextPatch", () => {
	test("bumps the patch number", () => {
		expect(nextPatch("1.2.1")).toBe("1.2.2");
		expect(nextPatch("1.9.9")).toBe("1.9.10");
	});

	test("rejects anything but x.y.z", () => {
		expect(() => nextPatch("1.2")).toThrow();
	});
});

describe("replaceVersion", () => {
	test("bumps both version files in place", () => {
		for (const file of ["app.config.ts", "store.config.js"]) {
			const source = readFileSync(join(import.meta.dir, "..", file), "utf8");
			const current =
				/\bversion: (?:process\.env\.APP_STORE_VERSION \?\? )?"([\d.]+)"/.exec(
					source,
				)?.[1];
			expect(current).toBeDefined();
			const updated = replaceVersion(source, current as string, "9.9.9");
			expect(updated).toContain('"9.9.9"');
			expect(updated?.replace('"9.9.9"', `"${current}"`)).toBe(source);
		}
	});

	test("leaves a file on another version alone", () => {
		expect(replaceVersion('version: "1.2.2",', "1.2.1", "1.2.2")).toBeNull();
	});
});
