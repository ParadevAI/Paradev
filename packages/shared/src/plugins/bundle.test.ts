import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
	PluginBundleError,
	packPluginBundle,
	pluginBundleHash,
	unpackPluginBundle,
} from "./bundle";

const tree = new Map([
	["plugin.json", Buffer.from('{"name":"team-tools"}')],
	["skills/triage/SKILL.md", Buffer.from("---\nname: triage\n---\n")],
	["scripts/deploy.sh", Buffer.from("#!/bin/sh\necho hi\n")],
	["assets/icon.svg", Buffer.from("<svg/>")],
]);

function raw(files: unknown[]): Buffer {
	return gzipSync(JSON.stringify({ format: 1, files }));
}

describe("plugin bundles", () => {
	test("a tree comes back byte for byte, and packs the same way twice", () => {
		const bundle = packPluginBundle(tree, new Set(["scripts/deploy.sh"]));
		expect(unpackPluginBundle(bundle)).toEqual({
			files: tree,
			executable: new Set(["scripts/deploy.sh"]),
		});
		expect(
			pluginBundleHash(
				packPluginBundle(
					new Map([...tree].reverse()),
					new Set(["scripts/deploy.sh"]),
				),
			),
		).toBe(pluginBundleHash(bundle));
	});

	test("a format 1 bundle still unpacks", () => {
		expect(
			unpackPluginBundle(
				raw([{ path: "plugin.json", content: "e30=" }]),
			).files.has("plugin.json"),
		).toBe(true);
	});

	test("a path outside the plugin tree is refused", () => {
		for (const path of [
			"../escape",
			"skills/../../x",
			"/etc/passwd",
			".git/config",
			"node_modules/x/index.js",
			"hooks/pre.sh",
			"plugin.json/x",
			"skills/a/node_modules/x/index.js",
			"skills/a/.git/config",
		]) {
			expect(() =>
				unpackPluginBundle(
					raw([
						{ path: "plugin.json", content: "e30=" },
						{ path, content: "" },
					]),
				),
			).toThrow(PluginBundleError);
		}
	});

	test("a bundle without plugin.json is refused", () => {
		expect(() =>
			unpackPluginBundle(raw([{ path: "skills/a/SKILL.md", content: "" }])),
		).toThrow("no plugin.json");
	});
});
