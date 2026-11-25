import { describe, expect, test } from "bun:test";
import { pluginIconFile } from "./plugin-icon";

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
