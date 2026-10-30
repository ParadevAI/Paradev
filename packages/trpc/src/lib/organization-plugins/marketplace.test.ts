import { describe, expect, test } from "bun:test";
import {
	findManifestFile,
	findMarketplaceFile,
	parseMarketplace,
	pluginTreeFiles,
	skillsIn,
	withVersion,
} from "./marketplace";

describe("parseMarketplace", () => {
	test("reads ./ sources, under the source path", () => {
		const { entries, problems } = parseMarketplace(
			{ plugins: [{ name: "ours", source: "./plugins/ours" }] },
			"tools",
		);
		expect(problems).toEqual([]);
		expect(entries.map(({ name, dir }) => ({ name, dir }))).toEqual([
			{ name: "ours", dir: "tools/plugins/ours" },
		]);
	});

	test("refuses sources outside the repository", () => {
		const { entries, problems } = parseMarketplace(
			{
				plugins: [
					{ name: "remote", source: { source: "github", repo: "a/b" } },
					{ name: "local", source: { source: "local", path: "./plugins/a" } },
					{ name: "bare", source: "plugins/a" },
					{ name: "everything", source: "./" },
					{ name: "escape", source: "./../secrets" },
				],
			},
			"",
		);
		expect(entries).toEqual([]);
		expect(problems.map((p) => p.name)).toEqual([
			"remote",
			"local",
			"bare",
			"everything",
			"escape",
		]);
	});

	test("refuses a file with no plugins list", () => {
		expect(() => parseMarketplace({}, "")).toThrow("no plugins list");
	});
});

describe("repository paths", () => {
	const paths = new Set([
		".agent-marketplace.json",
		".claude-plugin/marketplace.json",
		"plugins/a/plugin.json",
		"plugins/b/.claude-plugin/plugin.json",
		"plugins/a/skills/triage/SKILL.md",
		"plugins/a/commands/ship.md",
		"plugins/a/node_modules/x/index.js",
		"plugins/a/hooks/pre.sh",
		"plugins/a/scripts/deploy.sh",
		"plugins/a/README.md",
		"plugins/ab/skills/other/SKILL.md",
	]);

	test("reads only .agent-marketplace.json and plugin.json", () => {
		expect(findMarketplaceFile(paths, "")).toBe(".agent-marketplace.json");
		expect(
			findMarketplaceFile(new Set([".claude-plugin/marketplace.json"]), ""),
		).toBeNull();
		expect(findManifestFile(paths, "plugins/a")).toBe("plugins/a/plugin.json");
		expect(findManifestFile(paths, "plugins/b")).toBeNull();
	});

	test("carries the whole plugin directory except hooks, node_modules and .git", () => {
		expect([...pluginTreeFiles(paths, "plugins/a")]).toEqual([
			["plugins/a/skills/triage/SKILL.md", "skills/triage/SKILL.md"],
			["plugins/a/commands/ship.md", "commands/ship.md"],
			["plugins/a/scripts/deploy.sh", "scripts/deploy.sh"],
			["plugins/a/README.md", "README.md"],
		]);
	});
});

describe("pluginTreeFiles with nested plugins", () => {
	test("a plugin inside another plugin's folder is not bundled with it", () => {
		const paths = [
			"plugins/a/skills/one/SKILL.md",
			"plugins/a/b/plugin.json",
			"plugins/a/b/skills/two/SKILL.md",
		];
		expect([
			...pluginTreeFiles(paths, "plugins/a", [
				"plugins/a",
				"plugins/a/b",
			]).values(),
		]).toEqual(["skills/one/SKILL.md"]);
	});
});

describe("withVersion", () => {
	test("a generated version changes when only an executable bit changes", () => {
		const files = new Map([["scripts/run.sh", Buffer.from("#!/bin/sh\n")]]);
		expect(
			withVersion({ name: "a" }, files, new Set(["scripts/run.sh"])).version,
		).not.toBe(withVersion({ name: "a" }, files).version);
	});

	const files = new Map([["skills/a/SKILL.md", Buffer.from("one")]]);

	test("keeps a declared version", () => {
		expect(withVersion({ name: "a", version: "1.2.0" }, files).version).toBe(
			"1.2.0",
		);
	});

	test("derives a missing version from the content", () => {
		const first = withVersion({ name: "a" }, files).version;
		expect(withVersion({ name: "a" }, files).version).toBe(first);
		expect(
			withVersion(
				{ name: "a" },
				new Map([["skills/a/SKILL.md", Buffer.from("two")]]),
			).version,
		).not.toBe(first);
	});
});

describe("skillsIn", () => {
	test("names skills from their frontmatter, falling back to the directory", () => {
		const files = new Map([
			[
				"skills/triage/SKILL.md",
				Buffer.from(
					'---\nname: triage\ndescription: "Sort new issues"\n---\nBody',
				),
			],
			["skills/bare/SKILL.md", Buffer.from("No frontmatter")],
			["commands/ship.md", Buffer.from("x")],
		]);
		expect(skillsIn(files)).toEqual([
			{ name: "bare", description: "" },
			{ name: "triage", description: "Sort new issues" },
		]);
	});
});
