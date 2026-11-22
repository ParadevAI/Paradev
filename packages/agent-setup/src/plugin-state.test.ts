import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginError } from "./plugin-error";
import {
	marketplaceManifest,
	pluginsRoot,
	readInstalledPlugins,
	readKnownMarketplaces,
} from "./plugin-state";

describe("plugin state readers", () => {
	const previousHome = process.env.SUPERSET_HOME_DIR;
	let home = "";
	const write = (file: string, contents: string) => {
		fs.mkdirSync(pluginsRoot(), { recursive: true });
		fs.writeFileSync(path.join(pluginsRoot(), file), contents);
	};

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-state-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		fs.rmSync(home, { recursive: true, force: true });
	});

	test("a missing file is empty", () => {
		expect(readInstalledPlugins()).toEqual([]);
		expect(readKnownMarketplaces()).toEqual({});
	});

	test("a corrupt file throws rather than reading as empty", () => {
		write("installed_plugins.json", "{not json");
		write("known_marketplaces.json", "{not json");
		expect(() => readInstalledPlugins()).toThrow(PluginError);
		expect(() => readKnownMarketplaces()).toThrow(PluginError);
	});

	test("a ledger with no plugins list throws", () => {
		write("installed_plugins.json", JSON.stringify({ version: 1 }));
		expect(() => readInstalledPlugins()).toThrow("has no plugins list");
	});

	test("a ledger with a malformed entry throws a PluginError, not a TypeError", () => {
		for (const entry of [null, 3, { marketplace: "superset" }]) {
			write("installed_plugins.json", JSON.stringify({ plugins: [entry] }));
			expect(() => readInstalledPlugins()).toThrow(PluginError);
		}
	});

	test("an inherited key is not an installed marketplace", () => {
		write("known_marketplaces.json", "{}");
		expect(() => marketplaceManifest("constructor")).toThrow(
			'Marketplace "constructor" is not installed.',
		);
	});
});
