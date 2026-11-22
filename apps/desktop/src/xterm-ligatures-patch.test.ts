import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on @xterm/addon-ligatures (patches/README.md). Its ESM
// build imports node:diagnostics_channel, which Vite externalizes for the
// browser: the renderer throws at module load and never mounts. No unit test
// imports the addon, so a version bump that drops the patch would ship a white
// screen. If this fails after a bump, regenerate the patch; do NOT delete it.
describe("@xterm/addon-ligatures package.json patch", () => {
	const pkgDir = dirname(
		require.resolve("@xterm/addon-ligatures/package.json"),
	);
	const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

	test("module and the import condition point at the CommonJS build", () => {
		expect(pkg.module).toBe("lib/addon-ligatures.js");
		expect(pkg.exports?.["."]?.import).toBe("./lib/addon-ligatures.js");
	});

	test("the entry Vite resolves does not import node:diagnostics_channel", () => {
		const entry = readFileSync(join(pkgDir, pkg.module), "utf8");
		expect(entry).not.toContain("diagnostics_channel");
	});
});
