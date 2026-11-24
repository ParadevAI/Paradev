import { describe, expect, test } from "bun:test";
import type { InstalledPlugin } from "./host";
import { resolveMcpPluginRef } from "./mcp-client";

const ORG = "organization-0f9c";

function install(name: string, marketplace: string): InstalledPlugin {
	return {
		name,
		marketplace,
		version: "1.0.0",
		installedAt: "2026-11-24T00:00:00.000Z",
		enabled: true,
	};
}

describe("resolveMcpPluginRef", () => {
	test("a bare name takes the marketplace of its one install", () => {
		expect(
			resolveMcpPluginRef("admin", "0f9c", [
				install("linear", "superset"),
				install("admin", ORG),
			]),
		).toEqual({ plugin: "admin", marketplace: ORG });
	});

	test("a bare name with no install asks the default marketplace", () => {
		expect(resolveMcpPluginRef("linear", undefined, [])).toEqual({
			plugin: "linear",
			marketplace: "superset",
		});
	});

	test("a bare name installed twice fails with both refs", () => {
		expect(() =>
			resolveMcpPluginRef("linear", undefined, [
				install("linear", "superset"),
				install("linear", ORG),
			]),
		).toThrow(
			expect.objectContaining({
				suggestion: `Name one: --plugin linear@superset or --plugin linear@${ORG}`,
			}),
		);
	});

	test("name@organization is the active organization's marketplace", () => {
		expect(resolveMcpPluginRef("admin@organization", "0f9c", [])).toEqual({
			plugin: "admin",
			marketplace: ORG,
		});
	});

	test("name@organization with no active organization fails", () => {
		expect(() =>
			resolveMcpPluginRef("admin@organization", undefined, []),
		).toThrow("no organization is active");
	});

	test("a named marketplace is kept as given", () => {
		expect(
			resolveMcpPluginRef("linear@acme", undefined, [
				install("linear", "superset"),
			]),
		).toEqual({ plugin: "linear", marketplace: "acme" });
	});
});
