import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pluginCachePath, writePluginTree } from "./plugin-cache";

let home: string;

beforeEach(() => {
	home = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-cache-"));
	process.env.SUPERSET_HOME_DIR = home;
});

afterEach(() => {
	delete process.env.SUPERSET_HOME_DIR;
	fs.rmSync(home, { recursive: true, force: true });
});

const tree = (body: string) =>
	new Map([
		["plugin.json", Buffer.from('{"name":"tools"}')],
		["skills/a/SKILL.md", Buffer.from(body)],
	]);

describe("writePluginTree", () => {
	test("replaces an existing tree and leaves nothing beside it", () => {
		writePluginTree("organization-o", "tools", "1.0.0", tree("old"));
		const target = writePluginTree(
			"organization-o",
			"tools",
			"1.0.0",
			tree("new"),
		);

		expect(
			fs.readFileSync(path.join(target, "skills/a/SKILL.md"), "utf8"),
		).toBe("new");
		expect(fs.readdirSync(path.dirname(target))).toEqual(["1.0.0"]);
	});

	test("keeps the old tree when the new one cannot be moved into place", () => {
		writePluginTree("organization-o", "tools", "1.0.0", tree("old"));
		const target = pluginCachePath("organization-o", "tools", "1.0.0");
		const rename = fs.renameSync;
		const spy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
			if (String(from).includes(".incoming-")) throw new Error("disk full");
			rename(from, to);
		});
		try {
			expect(() =>
				writePluginTree("organization-o", "tools", "1.0.0", tree("new")),
			).toThrow("disk full");
		} finally {
			spy.mockRestore();
		}

		expect(
			fs.readFileSync(path.join(target, "skills/a/SKILL.md"), "utf8"),
		).toBe("old");
		expect(fs.readdirSync(path.dirname(target))).toEqual(["1.0.0"]);
	});

	test("an executable file stays executable", () => {
		const target = writePluginTree(
			"organization-o",
			"tools",
			"1.0.0",
			new Map([...tree("x"), ["scripts/run.sh", Buffer.from("#!/bin/sh\n")]]),
			new Set(["scripts/run.sh"]),
		);
		expect(
			fs.statSync(path.join(target, "scripts/run.sh")).mode & 0o111,
		).not.toBe(0);
		expect(
			fs.statSync(path.join(target, "skills/a/SKILL.md")).mode & 0o111,
		).toBe(0);
	});
});
