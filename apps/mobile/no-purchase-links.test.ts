import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// App Review 3.1.1: only the US App Store storefront may link to a page where a
// plan is bought, and one build ships worldwide. Every billing URL lives in
// CHECKOUT_MODULE, and only GATE opens it, behind `billingLinksAllowed`.
const PURCHASE_PATH =
	/^(?!.*\bfrom\s+["']).*\/(settings\/billing|pricing|checkout|upgrade|autumn)\b/;
const CHECKOUT_MODULE = "lib/upgrade/checkout/";
const GATE = "lib/upgrade/useUpgrade/useUpgrade.ts";
const CHECKOUT_IMPORT =
	/from\s+["'][^"']*(upgrade\/checkout|\.\.\/checkout)["']/;
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

function matchingLines(pattern: RegExp, skip: (file: string) => boolean) {
	return SOURCE_DIRS.flatMap((dir) => sourceFiles(join(import.meta.dir, dir)))
		.map((file) => relative(import.meta.dir, file))
		.filter((file) => !skip(file))
		.flatMap((file) =>
			readFileSync(join(import.meta.dir, file), "utf8")
				.split("\n")
				.flatMap((line, index) =>
					pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
				),
		);
}

describe("purchase links", () => {
	test("only the checkout module names a page where a plan is bought", () => {
		expect(
			matchingLines(PURCHASE_PATH, (file) => file.startsWith(CHECKOUT_MODULE)),
		).toEqual([]);
	});

	test("only the storefront gate imports the checkout module", () => {
		expect(
			matchingLines(
				CHECKOUT_IMPORT,
				(file) => file === GATE || file.startsWith(CHECKOUT_MODULE),
			),
		).toEqual([]);
	});

	test("no copy names the website", () => {
		expect(matchingLines(/\bwebHost\(/, () => false)).toEqual([]);
	});
});
