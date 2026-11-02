import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveProjectConfigDirName } from "./dir";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "project-config-dir-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

function write(path: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), "");
}

describe("resolveProjectConfigDirName", () => {
	it("uses .paradev for a repo with no config", () => {
		expect(resolveProjectConfigDirName(root)).toBe(".paradev");
	});

	it("keeps using .superset while it holds the config", () => {
		write(".superset/config.toml");

		expect(resolveProjectConfigDirName(root)).toBe(".superset");
	});

	it("ignores a .paradev folder that holds only pdev's files", () => {
		write(".paradev/settings.json");
		write(".paradev/prompts/review.md");
		write(".superset/setup.sh");

		expect(resolveProjectConfigDirName(root)).toBe(".superset");
	});

	it("keeps .superset when .paradev holds only extra files", () => {
		write(".paradev/ports.json");
		write(".paradev/config.local.toml");
		write(".superset/config.toml");

		expect(resolveProjectConfigDirName(root)).toBe(".superset");
	});

	it("uses .superset for a repo configured only by scripts", () => {
		write(".superset/start.sh");

		expect(resolveProjectConfigDirName(root)).toBe(".superset");
	});

	it("prefers .paradev once it holds config", () => {
		write(".paradev/config.toml");
		write(".superset/config.json");

		expect(resolveProjectConfigDirName(root)).toBe(".paradev");
	});
});
