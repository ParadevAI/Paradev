import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	PLUGIN_ICON_MAX_BYTES,
	pluginIconFile,
	readPluginIcon,
} from "./plugin-icon";

let root: string;
let plugin: string;

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-icon-"));
	plugin = path.join(root, "acme");
	fs.mkdirSync(path.join(plugin, "assets"), { recursive: true });
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function writeManifest(icon: unknown) {
	fs.writeFileSync(
		path.join(plugin, "plugin.json"),
		JSON.stringify({
			name: "acme",
			extensions: { superset: { interface: { icon } } },
		}),
	);
}

describe("pluginIconFile", () => {
	test("accepts an image path inside the plugin", () => {
		expect(pluginIconFile("./assets/icon.png")).toEqual({
			relative: "assets/icon.png",
			mime: "image/png",
		});
		expect(pluginIconFile("icon.SVG")?.mime).toBe("image/svg+xml");
	});

	test("rejects slugs, URLs, absolute paths, traversal and other formats", () => {
		for (const icon of [
			"github",
			"https://example.com/icon.png",
			"data:image/png;base64,AAAA",
			"/etc/icon.png",
			"../icon.png",
			"assets/../../icon.png",
			"assets\\icon.png",
			"assets/icon.gif",
			"",
			42,
		]) {
			expect(pluginIconFile(icon)).toBeNull();
		}
	});
});

describe("readPluginIcon", () => {
	test("returns the icon file as a data URI", () => {
		writeManifest("./assets/icon.svg");
		fs.writeFileSync(path.join(plugin, "assets/icon.svg"), "<svg/>");

		expect(readPluginIcon(plugin)).toBe(
			`data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
		);
	});

	test("refuses a symlink that leaves the plugin", () => {
		fs.writeFileSync(path.join(root, "outside.png"), "x");
		fs.symlinkSync(
			path.join(root, "outside.png"),
			path.join(plugin, "assets/icon.png"),
		);
		writeManifest("assets/icon.png");

		expect(readPluginIcon(plugin)).toBeNull();
	});

	test("refuses a file over the size limit", () => {
		writeManifest("assets/icon.png");
		fs.writeFileSync(
			path.join(plugin, "assets/icon.png"),
			Buffer.alloc(PLUGIN_ICON_MAX_BYTES + 1),
		);

		expect(readPluginIcon(plugin)).toBeNull();
	});

	test("returns null for a missing file or a slug", () => {
		writeManifest("assets/missing.png");
		expect(readPluginIcon(plugin)).toBeNull();

		writeManifest("acme");
		expect(readPluginIcon(plugin)).toBeNull();
	});
});
