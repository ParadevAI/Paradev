import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	getPluginByName,
	isServerSatisfiedExternally,
	PLUGIN_CATALOG,
	SUPERSET_MANAGED_SKILLS,
} from "./index";
import { FIRST_PARTY_MANIFESTS } from "./manifests.generated";

describe("PLUGIN_CATALOG", () => {
	test("covers every published first-party manifest", () => {
		const missing = Object.keys(FIRST_PARTY_MANIFESTS).filter(
			(name) => !getPluginByName(name),
		);
		expect(missing).toEqual([]);
	});

	test("agrees with each manifest on display name", () => {
		for (const [name, manifest] of Object.entries(FIRST_PARTY_MANIFESTS)) {
			expect(getPluginByName(name)?.interface.displayName).toBe(
				manifest.extensions.superset.interface.displayName,
			);
		}
	});

	test("has no duplicate names", () => {
		const names = PLUGIN_CATALOG.map((plugin) => plugin.name);
		expect(names).toEqual([...new Set(names)]);
	});
});

describe("isServerSatisfiedExternally", () => {
	const proxy = "https://api.superset.sh/mcp/plugins/superset/linear";
	const linear = { type: "http", url: proxy } as const;

	test("a user's Paradev MCP entry does not satisfy a proxied plugin", () => {
		expect(
			isServerSatisfiedExternally("linear", linear, [
				{ name: "superset", url: "https://api.superset.sh/mcp" },
			]),
		).toBe(false);
	});

	test("an entry for the same proxy path satisfies it", () => {
		expect(
			isServerSatisfiedExternally("linear", linear, [
				{ name: "my-linear", url: `${proxy}/` },
			]),
		).toBe(true);
	});

	test("an entry pinned to one account satisfies only that account", () => {
		const external = [
			{ name: "my-linear", url: `${proxy}?connection=conn-work` },
		];
		const pinned = (connection: string) =>
			({ type: "http", url: `${proxy}?connection=${connection}` }) as const;
		expect(
			isServerSatisfiedExternally("linear-work", pinned("conn-work"), external),
		).toBe(true);
		expect(
			isServerSatisfiedExternally("linear-side", pinned("conn-side"), external),
		).toBe(false);
	});

	test("a legacy Paradev MCP URL still satisfies the superset server", () => {
		expect(
			isServerSatisfiedExternally(
				"superset",
				{ type: "http", url: "https://api.superset.sh/mcp" },
				[
					{
						name: "superset-mcp",
						url: "https://api.superset.sh/api/v2/agent/mcp",
					},
				],
			),
		).toBe(true);
	});

	test("a vendor URL still matches by hostname", () => {
		expect(
			isServerSatisfiedExternally(
				"playwright",
				{ type: "http", url: "https://mcp.example.com/mcp" },
				[{ name: "pw", url: "https://mcp.example.com/sse" }],
			),
		).toBe(true);
	});
});

describe("SUPERSET_MANAGED_SKILLS", () => {
	test("includes every skill bundled under plugins/superset/skills", () => {
		const skillsDir = path.resolve(
			import.meta.dir,
			"../../../../plugins/superset/skills",
		);
		const bundledSkills = fs
			.readdirSync(skillsDir, { withFileTypes: true })
			.filter(
				(dirent) =>
					dirent.isDirectory() &&
					fs.existsSync(path.resolve(skillsDir, dirent.name, "SKILL.md")),
			)
			.map((dirent) => dirent.name);

		const managedSkillNames: string[] = SUPERSET_MANAGED_SKILLS.map(
			(skill) => skill.name,
		);

		for (const skill of bundledSkills) {
			expect(managedSkillNames).toContain(skill);
		}
	});
});
