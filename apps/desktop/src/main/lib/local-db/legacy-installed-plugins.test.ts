import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adoptLegacyInstalledPlugins } from "./legacy-installed-plugins";

describe("adoptLegacyInstalledPlugins", () => {
	let dir = "";
	let file = "";
	let sqlite: Database;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-plugins-"));
		file = path.join(dir, "installed_plugins.json");
		sqlite = new Database(":memory:");
	});

	afterEach(() => {
		sqlite.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("moves the installs only the desktop recorded into the ledger", () => {
		sqlite.run(
			"CREATE TABLE settings (id integer PRIMARY KEY, installed_plugins text)",
		);
		sqlite.run("INSERT INTO settings VALUES (1, ?)", [
			JSON.stringify([
				{ name: "linear", version: "1.0.0", installedAt: "then" },
				{
					name: "sentry",
					version: "1.0.0",
					installedAt: "then",
					enabled: false,
				},
			]),
		]);

		expect(adoptLegacyInstalledPlugins(sqlite, file)).toEqual([
			"linear",
			"sentry",
		]);
		const { plugins } = JSON.parse(fs.readFileSync(file, "utf-8"));
		expect(
			plugins.map((p: { name: string; enabled: boolean }) => [
				p.name,
				p.enabled,
			]),
		).toEqual([
			["linear", true],
			["sentry", false],
		]);
	});

	test("does nothing once the column is gone", () => {
		sqlite.run("CREATE TABLE settings (id integer PRIMARY KEY)");
		expect(adoptLegacyInstalledPlugins(sqlite, file)).toEqual([]);
		expect(fs.existsSync(file)).toBe(false);
	});
});
