import { describe, expect, it } from "bun:test";
import path from "node:path";
import { resolveBootAppName } from "./legacy-app-name";

const appDataDir = path.join("/home", "u", ".config");
const existing = (...names: string[]) => {
	const dirs = new Set(names.map((name) => path.join(appDataDir, name)));
	return (dir: string) => dirs.has(dir);
};

describe("resolveBootAppName", () => {
	it("keeps the legacy name when its profile exists", () => {
		expect(
			resolveBootAppName({
				appName: "Paradev",
				appDataDir,
				exists: existing("Superset"),
			}),
		).toBe("Superset");
	});

	it("uses the product name on a fresh install", () => {
		expect(
			resolveBootAppName({
				appName: "Paradev",
				appDataDir,
				exists: existing("Paradev", "Superset Canary"),
			}),
		).toBe("Paradev");
	});
});
