import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { teardownAgents } from "./agent-setup";
import {
	createDevinConfigJson,
	getDevinConfigJsonPath,
} from "./agent-wrappers-devin";
import {
	createDroidSettingsJson,
	getDroidSettingsJsonPath,
} from "./agent-wrappers-droid";

const ORIGINAL_ENV = {
	HOME: process.env.HOME,
	SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR,
	XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};
let root: string;

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-setup-"));
	process.env.HOME = path.join(root, "home");
	process.env.SUPERSET_HOME_DIR = path.join(root, "app-home");
	process.env.XDG_CONFIG_HOME = path.join(root, "home", ".config");
});

afterEach(() => {
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	fs.rmSync(root, { recursive: true, force: true });
});

describe("teardownAgents", () => {
	it("removes managed hooks of only the selected agents and creates no files", () => {
		for (const file of [getDevinConfigJsonPath(), getDroidSettingsJsonPath()]) {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, JSON.stringify({ theme: "dark" }));
		}
		createDevinConfigJson();
		createDroidSettingsJson();

		expect(teardownAgents(["devin", "claude"])).toEqual([]);

		expect(
			JSON.parse(fs.readFileSync(getDevinConfigJsonPath(), "utf-8")),
		).toEqual({ theme: "dark", version: 1 });
		expect(fs.readFileSync(getDroidSettingsJsonPath(), "utf-8")).toContain(
			"paradev-notify",
		);
		expect(fs.existsSync(path.join(root, "home", ".claude"))).toBe(false);
	});
});
