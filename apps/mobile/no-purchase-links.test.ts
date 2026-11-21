import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BILLING_REFUSAL_KEYS } from "./lib/errors/billingRefusalKeys";

// App Review 3.1.1 and Google Play Payments: one build ships to every
// storefront. Billing URLs and the web host live in BILLING_SOURCES, and only
// GATE reads them, behind `billingAccess` (unit-tested per mode).
const CHECKOUT_MODULE = "lib/upgrade/checkout/";
const WEB_LINKS = "lib/web-links.ts";
const GATE = "lib/upgrade/useUpgrade/useUpgrade.ts";
const BILLING_SOURCES = (file: string) =>
	file === WEB_LINKS || file.startsWith(CHECKOUT_MODULE);
const BILLING_HELPER = /\b(billingSettingsUrl|proCheckoutUrl|webHost)\b/;
const HARDCODED_HOST = /(?:^|[^@\w-])(?:superset\.sh|paradev\.com)\b/i;
const HOST_COPY = /Upgrade to Pro at|Manage at/;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;
const IMPORT_SPECIFIER =
	/(from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*["']/g;
const PURCHASE_PATH =
	/(settings\/billing|\/pricing|\/checkout|\/upgrade\b|autumn\/)/;
const CHECKOUT_IMPORT =
	/(from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*checkout[^"']*["']/;
const WEBSITE_COPY = /on the web\b|\bwebsite\b/i;
const SOURCE_DIRS = ["app", "screens", "lib", "components", "hooks", "modules"];
const SOURCE_FILE = /\.(ts|tsx)$/;
const SKIPPED_FILE = /(\.test\.tsx?|\.generated\.ts)$/;
const REPO_ROOT = join(import.meta.dir, "../..");
const SERVER_DIRS = ["packages/trpc/src", "packages/auth/src"];

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

function matchingLines(
	matches: (line: string) => boolean,
	skip: (file: string) => boolean,
) {
	return SOURCE_DIRS.flatMap((dir) => sourceFiles(join(import.meta.dir, dir)))
		.map((file) => relative(import.meta.dir, file))
		.filter((file) => !skip(file))
		.flatMap((file) =>
			readFileSync(join(import.meta.dir, file), "utf8")
				.split("\n")
				.flatMap((line, index) =>
					matches(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
				),
		);
}

describe("purchase links", () => {
	test("only the checkout module names a page where a plan is bought", () => {
		expect(
			matchingLines(
				(line) => PURCHASE_PATH.test(line.replace(IMPORT_SPECIFIER, "")),
				BILLING_SOURCES,
			),
		).toEqual([]);
	});

	test("only the gate reads billing URLs or the web host", () => {
		expect(
			matchingLines(
				(line) => BILLING_HELPER.test(line) && !COMMENT.test(line),
				(file) => file === GATE || BILLING_SOURCES(file),
			),
		).toEqual([]);
	});

	test("no source hardcodes a product host", () => {
		expect(
			matchingLines(
				(line) => HARDCODED_HOST.test(line),
				(file) => file === "lib/env.ts" || file.endsWith(".stories.tsx"),
			),
		).toEqual([]);
	});

	test("copy names a host only through the gate's upgradeHost", () => {
		expect(
			matchingLines(
				(line) => HOST_COPY.test(line) && !/\bupgradeHost\b/.test(line),
				() => false,
			),
		).toEqual([]);
	});

	test("only the storefront gate imports or re-exports the checkout module", () => {
		expect(
			matchingLines(
				(line) => CHECKOUT_IMPORT.test(line),
				(file) => file === GATE || file.startsWith(CHECKOUT_MODULE),
			),
		).toEqual([]);
	});

	test("no copy names the website", () => {
		expect(
			matchingLines(
				(line) => WEBSITE_COPY.test(line) && !COMMENT.test(line),
				() => false,
			),
		).toEqual([]);
	});

	test("every server refusal that says where to upgrade is reworded by the app", () => {
		const keysThatNameBilling = SERVER_DIRS.flatMap((dir) =>
			sourceFiles(join(REPO_ROOT, dir)),
		).flatMap((file) => {
			const source = readFileSync(file, "utf8");
			return [...source.matchAll(/i18nKey:\s*"(serverError\.[^"]+)"/g)]
				.filter((match) =>
					/upgrade in Settings|Settings, Billing|Settings > Billing/i.test(
						source.slice(Math.max(0, (match.index ?? 0) - 400), match.index),
					),
				)
				.map((match) => match[1]);
		});
		const missing = [...new Set(keysThatNameBilling)].filter(
			(key) => !(BILLING_REFUSAL_KEYS as readonly string[]).includes(key),
		);
		expect(keysThatNameBilling.length).toBeGreaterThan(0);
		expect(missing).toEqual([]);
	});
});
