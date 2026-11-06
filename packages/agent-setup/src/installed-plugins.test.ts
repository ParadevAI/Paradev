import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adoptInstalledPlugins, readEnabledPlugins } from "./installed-plugins";

let dir: string;
let file: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "ledger-"));
	file = join(dir, "installed_plugins.json");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("readEnabledPlugins", () => {
	it("reads the enabled entries with their marketplace, skipping the disabled", () => {
		writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				plugins: [
					{ name: "linear", marketplace: "superset", enabled: true },
					{ name: "sentry", marketplace: "superset", enabled: false },
					{ name: "figma", marketplace: "acme" },
				],
			}),
		);

		expect(readEnabledPlugins(file)).toEqual([
			{ name: "linear", marketplace: "superset" },
			{ name: "figma", marketplace: "acme" },
		]);
	});

	it("reports no plugins when the ledger does not exist", () => {
		expect(readEnabledPlugins(file)).toEqual([]);
	});

	it("reports an unreadable ledger as null, not as no plugins", () => {
		writeFileSync(file, "{not json");
		expect(readEnabledPlugins(file)).toBeNull();

		writeFileSync(file, JSON.stringify({ version: 1 }));
		expect(readEnabledPlugins(file)).toBeNull();

		expect(readEnabledPlugins(dir)).toBeNull();
	});
});

describe("adoptInstalledPlugins", () => {
	const record = (name: string, enabled?: boolean) => ({
		name,
		version: "1.0.0",
		installedAt: "then",
		...(enabled === undefined ? {} : { enabled }),
	});

	it("adds only the plugins the ledger lacks, keeping a disabled one disabled", () => {
		writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				plugins: [
					{
						name: "linear",
						marketplace: "superset",
						version: "2.0.0",
						installPath: "/cache/linear",
						installedAt: "now",
						enabled: true,
					},
				],
			}),
		);

		expect(
			adoptInstalledPlugins(
				[record("linear"), record("sentry", false), record("figma")],
				file,
			),
		).toEqual(["sentry", "figma"]);

		const { plugins } = JSON.parse(readFileSync(file, "utf-8"));
		expect(plugins).toEqual([
			expect.objectContaining({ name: "linear", version: "2.0.0" }),
			{
				marketplace: "superset",
				name: "sentry",
				version: "1.0.0",
				installedAt: "then",
				enabled: false,
			},
			expect.objectContaining({ name: "figma", enabled: true }),
		]);
	});

	it("refuses to replace a ledger it cannot read", () => {
		writeFileSync(file, "{not json");
		expect(() => adoptInstalledPlugins([record("linear")], file)).toThrow();
		expect(readFileSync(file, "utf-8")).toBe("{not json");
	});
});
