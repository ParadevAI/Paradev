import { describe, expect, test } from "bun:test";
import { isUpdateAvailable, localVersionKey } from "./isUpdateAvailable";

const ORG = "organization-0b6b5c55-0000-4000-8000-000000000000";
const row = (
	overrides: Partial<Parameters<typeof isUpdateAvailable>[0]> = {},
) => ({
	name: "deployer",
	marketplace: ORG,
	installed: true,
	enabled: true,
	version: "1.2.0",
	latestVersion: "1.2.0",
	...overrides,
});
const onMachine = (version: string) =>
	new Map([[localVersionKey(ORG, "deployer"), version]]);

describe("isUpdateAvailable", () => {
	test("an organization plugin behind on this machine can be updated", () => {
		expect(isUpdateAvailable(row(), onMachine("1.1.0"))).toBe(true);
	});

	test("an organization plugin at the latest version on this machine cannot", () => {
		expect(isUpdateAvailable(row(), onMachine("1.2.0"))).toBe(false);
	});

	test("an organization plugin that has not reached this machine can be updated", () => {
		expect(isUpdateAvailable(row(), new Map())).toBe(true);
	});

	test("nothing is offered before the machine's versions are read", () => {
		expect(isUpdateAvailable(row(), undefined)).toBe(false);
	});

	test("a disabled plugin offers no update", () => {
		expect(isUpdateAvailable(row({ enabled: false }), new Map())).toBe(false);
	});

	test("the same name from another organization is a different plugin", () => {
		const other = "organization-1c7c6d66-0000-4000-8000-000000000000";
		expect(
			isUpdateAvailable(
				row(),
				new Map([[localVersionKey(other, "deployer"), "1.2.0"]]),
			),
		).toBe(true);
	});

	test("other plugins compare the account's versions", () => {
		const linear = row({ name: "linear", marketplace: "superset" });
		expect(isUpdateAvailable({ ...linear, version: "1.0.0" }, undefined)).toBe(
			true,
		);
		expect(isUpdateAvailable(linear, undefined)).toBe(false);
	});
});
