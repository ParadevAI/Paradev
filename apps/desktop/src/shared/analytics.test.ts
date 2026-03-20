import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression test for https://github.com/superset-sh/superset/issues/2577
 *
 * The desktop app was dual-shipping every analytics event to both PostHog and Outlit.
 * Outlit duplicated Sentry (error tracking) + PostHog (analytics) and added ~300KB
 * to the bundle for no extra value.
 *
 * These tests verify Outlit has been fully removed.
 */
describe("Outlit removal — issue #2577", () => {
	const desktopRoot = path.resolve(import.meta.dir, "..");

	test("shared/analytics.ts (toOutlitProperties helper) is deleted", () => {
		const exists = fs.existsSync(path.join(desktopRoot, "shared/analytics.ts"));
		expect(exists).toBe(false);
	});

	test("renderer/lib/outlit/ directory is deleted", () => {
		const exists = fs.existsSync(path.join(desktopRoot, "renderer/lib/outlit"));
		expect(exists).toBe(false);
	});

	test("main/lib/outlit/ directory is deleted", () => {
		const exists = fs.existsSync(path.join(desktopRoot, "main/lib/outlit"));
		expect(exists).toBe(false);
	});

	test("OutlitProvider is deleted", () => {
		const exists = fs.existsSync(
			path.join(desktopRoot, "renderer/providers/OutlitProvider"),
		);
		expect(exists).toBe(false);
	});

	test("renderer analytics does not import outlit", () => {
		const content = fs.readFileSync(
			path.join(desktopRoot, "renderer/lib/analytics/index.ts"),
			"utf-8",
		);
		expect(content).not.toContain("outlit");
	});

	test("main analytics does not import outlit", () => {
		const content = fs.readFileSync(
			path.join(desktopRoot, "main/lib/analytics/index.ts"),
			"utf-8",
		);
		expect(content).not.toContain("outlit");
	});

	test("TelemetrySync does not reference outlit", () => {
		const content = fs.readFileSync(
			path.join(
				desktopRoot,
				"renderer/components/TelemetrySync/TelemetrySync.tsx",
			),
			"utf-8",
		);
		expect(content).not.toContain("outlit");
	});

	test("renderer index.tsx does not reference outlit", () => {
		const content = fs.readFileSync(
			path.join(desktopRoot, "renderer/index.tsx"),
			"utf-8",
		);
		expect(content).not.toContain("outlit");
	});

	test("main index.ts does not reference outlit", () => {
		const content = fs.readFileSync(
			path.join(desktopRoot, "main/index.ts"),
			"utf-8",
		);
		expect(content).not.toContain("outlit");
	});

	test("package.json does not include @outlit dependencies", () => {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(desktopRoot, "..", "package.json"), "utf-8"),
		);
		const allDeps = {
			...pkg.dependencies,
			...pkg.devDependencies,
		};
		expect(allDeps["@outlit/browser"]).toBeUndefined();
		expect(allDeps["@outlit/node"]).toBeUndefined();
	});

	test("CSP does not allow outlit.ai connections", () => {
		const content = fs.readFileSync(
			path.join(desktopRoot, "renderer/index.html"),
			"utf-8",
		);
		expect(content).not.toContain("outlit.ai");
	});
});
