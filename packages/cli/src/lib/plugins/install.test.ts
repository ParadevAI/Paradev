import { describe, expect, test } from "bun:test";
import { ledgerWithPlugin } from "./install";

const update = {
	name: "tools",
	marketplace: "organization-o",
	version: "1.1.0",
	installPath: "/cache/tools/1.1.0",
};

describe("ledgerWithPlugin", () => {
	test("an update keeps a plugin the member disabled disabled", () => {
		const ledger = ledgerWithPlugin(
			[{ ...update, version: "1.0.0", installedAt: "then", enabled: false }],
			update,
			"now",
		);
		expect(ledger).toEqual([{ ...update, installedAt: "now", enabled: false }]);
	});

	test("a new plugin is enabled", () => {
		expect(ledgerWithPlugin([], update, "now")[0]?.enabled).toBe(true);
	});
});
