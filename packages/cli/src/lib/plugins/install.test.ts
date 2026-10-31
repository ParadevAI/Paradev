import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { marketplacesDir, writeKnownMarketplaces } from "./host";
import {
	findAvailablePlugin,
	ledgerWithPlugin,
	listAvailable,
	refreshMarketplaces,
} from "./install";
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
		const found = await findAvailablePlugin("autumn", "superset", async () => {
			writeManifest(["linear", "autumn"]);
			return [];
		});
		expect(found.entry.name).toBe("autumn");
	});

	test("does not refresh when the clone already has the plugin", async () => {
		let refreshed = false;
		await findAvailablePlugin("linear", undefined, async () => {
			refreshed = true;
			return [];
		});
		expect(refreshed).toBe(false);
	});

	test("names the refresh failure when the plugin is still missing", async () => {
		await expect(
			findAvailablePlugin("autumn", "superset", async () => [
				"superset: offline",
			]),
		).rejects.toMatchObject({
			suggestion: "Some marketplaces could not be updated: superset: offline",
		});
	});
});

describe("refreshMarketplaces", () => {
	let home: string;
	const previousHome = process.env.SUPERSET_HOME_DIR;
	const git = (cwd: string, ...args: string[]) =>
		execFileSync("git", args, { cwd, stdio: "ignore" });
	const manifest = (dir: string, plugins: string[]) =>
		fs.writeFileSync(
			path.join(dir, MARKETPLACE_FILE),
			JSON.stringify({
				name: "superset",
				plugins: plugins.map((name) => ({ name, source: `./plugins/${name}` })),
			}),
		);
	const commit = (dir: string) =>
		git(
			dir,
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@t",
			"commit",
			"-qam",
			"x",
		);

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		fs.rmSync(home, { recursive: true, force: true });
	});

	test("a marketplace that cannot be fetched does not keep the next one stale", async () => {
		const origin = path.join(home, "origin");
		fs.mkdirSync(origin);
		git(origin, "init", "-q", "-b", "main");
		manifest(origin, ["linear"]);
		git(origin, "add", ".");
		commit(origin);

		const broken = path.join(marketplacesDir(), "broken");
		const superset = path.join(marketplacesDir(), "superset");
		fs.mkdirSync(broken, { recursive: true });
		git(broken, "init", "-q");
		git(broken, "remote", "add", "origin", path.join(home, "missing"));
		git(home, "clone", "-q", origin, superset);

		manifest(origin, ["linear", "autumn"]);
		commit(origin);

		const source = { kind: "github" as const, repo: "o/r", ref: "main" };
		writeKnownMarketplaces({
			broken: { source, installLocation: broken, lastUpdated: "then" },
			superset: { source, installLocation: superset, lastUpdated: "then" },
		});

		const failures = await refreshMarketplaces();
		expect(failures).toHaveLength(1);
		expect(failures[0]).toStartWith("broken:");
		expect(listAvailable().map((a) => a.entry.name)).toContain("autumn");
	});
});
