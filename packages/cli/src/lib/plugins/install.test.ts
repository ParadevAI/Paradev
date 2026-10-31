import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeKnownMarketplaces } from "./host";
import { findAvailablePlugin, ledgerWithPlugin } from "./install";
import { MARKETPLACE_FILE } from "./marketplace";

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

describe("findAvailablePlugin", () => {
	let home: string;
	let clone: string;
	const previousHome = process.env.SUPERSET_HOME_DIR;

	const writeManifest = (plugins: string[]) =>
		fs.writeFileSync(
			path.join(clone, MARKETPLACE_FILE),
			JSON.stringify({
				name: "superset",
				plugins: plugins.map((name) => ({ name, source: `./plugins/${name}` })),
			}),
		);

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), "find-available-"));
		process.env.SUPERSET_HOME_DIR = home;
		clone = path.join(home, "clone");
		fs.mkdirSync(clone);
		writeManifest(["linear"]);
		writeKnownMarketplaces({
			superset: {
				source: { kind: "github", repo: "o/r", ref: "main" },
				installLocation: clone,
				lastUpdated: "then",
			},
		});
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		fs.rmSync(home, { recursive: true, force: true });
	});

	test("refreshes a clone made before the plugin was added", async () => {
		const found = await findAvailablePlugin("autumn", "superset", async () =>
			writeManifest(["linear", "autumn"]),
		);
		expect(found.entry.name).toBe("autumn");
	});

	test("does not refresh when the clone already has the plugin", async () => {
		let refreshed = false;
		await findAvailablePlugin("linear", undefined, async () => {
			refreshed = true;
		});
		expect(refreshed).toBe(false);
	});

	test("names the refresh failure when the plugin is still missing", async () => {
		await expect(
			findAvailablePlugin("autumn", "superset", async () => {
				throw new Error("offline");
			}),
		).rejects.toMatchObject({
			suggestion: "The marketplace could not be updated: offline",
		});
	});
});
