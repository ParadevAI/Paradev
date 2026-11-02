import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adoptDesktopInstallList } from "./adopt-desktop-install-list";

describe("adoptDesktopInstallList", () => {
	let dir = "";
	let ledger = "";
	const list = [
		{ name: "linear", version: "1.0.0", installedAt: "then" },
		{ name: "sentry", version: "1.0.0", installedAt: "then", enabled: false },
	];
	const names = () =>
		JSON.parse(fs.readFileSync(ledger, "utf-8")).plugins.map(
			(p: { name: string; enabled: boolean }) => [p.name, p.enabled],
		);

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "adopt-desktop-list-"));
		ledger = path.join(dir, "installed_plugins.json");
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("moves the desktop's installs into the ledger once", () => {
		expect(adoptDesktopInstallList(list, ledger)).toEqual(["linear", "sentry"]);
		expect(names()).toEqual([
			["linear", true],
			["sentry", false],
		]);

		fs.writeFileSync(ledger, JSON.stringify({ version: 1, plugins: [] }));
		expect(adoptDesktopInstallList(list, ledger)).toEqual([]);
		expect(names()).toEqual([]);
	});

	test("copies what an older build added later, but not what was removed here", () => {
		adoptDesktopInstallList(list, ledger);
		fs.writeFileSync(ledger, JSON.stringify({ version: 1, plugins: [] }));

		const addedByOlderBuild = [
			...list,
			{ name: "notion", version: "1.0.0", installedAt: "later" },
		];
		expect(adoptDesktopInstallList(addedByOlderBuild, ledger)).toEqual([
			"notion",
		]);
		expect(names()).toEqual([["notion", true]]);
	});

	test("a damaged marker copies nothing rather than everything again", () => {
		adoptDesktopInstallList(list, ledger);
		fs.writeFileSync(ledger, JSON.stringify({ version: 1, plugins: [] }));
		for (const damaged of ["{damaged", JSON.stringify(["linear", 3])]) {
			fs.writeFileSync(path.join(dir, ".desktop-list-adopted"), damaged);
			expect(() => adoptDesktopInstallList(list, ledger)).toThrow();
		}
		expect(names()).toEqual([]);
	});

	test("tries again on the next boot when the ledger cannot be read", () => {
		fs.writeFileSync(ledger, "{not json");
		expect(() => adoptDesktopInstallList(list, ledger)).toThrow();

		fs.writeFileSync(ledger, JSON.stringify({ version: 1, plugins: [] }));
		expect(adoptDesktopInstallList(list, ledger)).toEqual(["linear", "sentry"]);
	});
});
