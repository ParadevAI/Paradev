import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MarketplaceContext } from "./marketplace";
import { scaffoldPlugin } from "./scaffold";

let root = "";

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-"));
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function context(): MarketplaceContext {
	return {
		root,
		file: path.join(root, ".agent-marketplace.json"),
		marketplace: { name: "test", plugins: [] },
	};
}

test("scaffolds only the manifest and lists the plugin under the marketplace category", () => {
	const ctx = context();

	const result = scaffoldPlugin(ctx, {
		name: "mail",
		kind: "url",
		url: "https://mail.test/mcp",
		category: "Developer tools",
		skills: false,
	});

	expect(result.files).toEqual(["plugin.json"]);
	expect(fs.readdirSync(path.join(root, "plugins", "mail"))).toEqual([
		"plugin.json",
	]);
	expect(ctx.marketplace.plugins[0]?.category).toBe("development");
});
