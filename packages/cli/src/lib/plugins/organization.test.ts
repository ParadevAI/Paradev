import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readInstalledPlugins, writeInstalledPlugins } from "./host";
import { recordPlugin } from "./install";
import {
	forgetOrganizationPlugins,
	reconcileOrganizationPlugins,
} from "./organization";

const STAYED = "organization-11111111-0000-4000-8000-000000000000";
const LEFT = "organization-22222222-0000-4000-8000-000000000000";

let home: string;
const previousHome = process.env.SUPERSET_HOME_DIR;

function plugin(name: string, marketplace: string) {
	const installPath = path.join(home, "plugins", "cache", marketplace, name);
	fs.mkdirSync(installPath, { recursive: true });
	fs.writeFileSync(path.join(installPath, "plugin.json"), "{}");
	return {
		name,
		marketplace,
		version: "1.0.0",
		installPath,
		installedAt: "then",
		enabled: true,
	};
}

beforeEach(() => {
	home = fs.mkdtempSync(path.join(os.tmpdir(), "org-plugins-"));
	process.env.SUPERSET_HOME_DIR = home;
	writeInstalledPlugins([
		plugin("linear", "superset"),
		plugin("deploy", STAYED),
		plugin("deploy", LEFT),
	]);
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	fs.rmSync(home, { recursive: true, force: true });
});

const stayedList = [
	{
		name: "deploy",
		marketplace: STAYED,
		installed: true,
		latestVersion: "1.0.0",
	},
];

const kept = () =>
	readInstalledPlugins().map((entry) => `${entry.marketplace}/${entry.name}`);

describe("forgetOrganizationPlugins", () => {
	test("removes every organization's plugins and leaves the others", () => {
		const gone = path.join(home, "plugins", "cache", LEFT, "deploy");
		expect(forgetOrganizationPlugins()).toEqual(["deploy", "deploy"]);
		expect(kept()).toEqual(["superset/linear"]);
		expect(fs.existsSync(gone)).toBe(false);
	});
});

describe("reconcileOrganizationPlugins", () => {
	test("removes a plugin another of the member's organizations took away", async () => {
		const lists: Record<string, unknown[]> = {
			[LEFT.slice(13)]: [],
		};
		const apiFor = (organizationId: string) =>
			({
				plugins: { list: { query: async () => lists[organizationId] ?? [] } },
			}) as never;
		const api = {
			plugins: { list: { query: async () => stayedList } },
			user: {
				myOrganizations: {
					query: async () => [{ id: STAYED.slice(13) }, { id: LEFT.slice(13) }],
				},
				myOrganization: { query: async () => ({ id: STAYED.slice(13) }) },
			},
		} as never;

		const result = await reconcileOrganizationPlugins(api, apiFor);

		expect(result.removed).toEqual(["deploy"]);
		expect(kept()).toEqual(["superset/linear", `${STAYED}/deploy`]);
	});

	test("removes the plugins of an organization the member left", async () => {
		const api = {
			plugins: { list: { query: async () => stayedList } },
			user: {
				myOrganizations: { query: async () => [{ id: STAYED.slice(13) }] },
				myOrganization: { query: async () => ({ id: STAYED.slice(13) }) },
			},
		} as never;

		const result = await reconcileOrganizationPlugins(api);

		expect(result.removed).toEqual(["deploy"]);
		expect(kept()).toEqual(["superset/linear", `${STAYED}/deploy`]);
	});
});

describe("recordPlugin", () => {
	test("a new version replaces the old one's folder", async () => {
		const old = path.join(home, "plugins", "cache", STAYED, "deploy");
		const next = path.join(home, "plugins", "cache", STAYED, "deploy-1.1.0");
		fs.mkdirSync(next, { recursive: true });

		await recordPlugin(
			{
				name: "deploy",
				marketplace: STAYED,
				version: "1.1.0",
				installPath: next,
			},
			{ provision: false },
		);

		expect(fs.existsSync(old)).toBe(false);
		expect(fs.existsSync(next)).toBe(true);
		expect(
			readInstalledPlugins().find((entry) => entry.marketplace === STAYED)
				?.version,
		).toBe("1.1.0");
	});
});
