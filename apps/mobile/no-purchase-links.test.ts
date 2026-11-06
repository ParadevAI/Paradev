import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// App Review 3.1.1: outside the US storefront the app may not link to a page
// where a plan is bought, and one build ships worldwide.
const PURCHASE_PATH = /\/(settings\/billing|pricing|checkout|upgrade)\b/;
const SOURCE_DIRS = ["app", "screens", "lib", "components", "hooks", "modules"];
const SOURCE_FILE = /\.(ts|tsx)$/;
const SKIPPED_FILE = /(\.test\.tsx?|\.generated\.ts)$/;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		if (entry === "node_modules" || entry === "ios" || entry === "android") {
			return [];
		}
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return SOURCE_FILE.test(entry) && !SKIPPED_FILE.test(entry) ? [path] : [];
	});
}

describe("purchase links", () => {
	test("no mobile source links to a page where a plan is bought", () => {
		const offenders = SOURCE_DIRS.flatMap((dir) =>
			sourceFiles(join(import.meta.dir, dir)),
		).flatMap((file) =>
			readFileSync(file, "utf8")
				.split("\n")
				.flatMap((line, index) =>
					PURCHASE_PATH.test(line)
						? [
								`${relative(import.meta.dir, file)}:${index + 1}: ${line.trim()}`,
							]
						: [],
				),
		);
		expect(offenders).toEqual([]);
	});
});
