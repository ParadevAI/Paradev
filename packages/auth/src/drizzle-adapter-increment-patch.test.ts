import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on @better-auth/drizzle-adapter (patches/README.md).
// Without it two concurrent refreshes both rotate one refresh token and leave
// two live children, so a revoke misses one. The race needs real Postgres, so
// this checks the patch is still applied to the installed version.
const repoRoot = join(import.meta.dir, "../../..");

describe("@better-auth/drizzle-adapter atomic incrementOne patch", () => {
	test("is registered and applied for the installed version", () => {
		const entry = Bun.resolveSync(
			"@better-auth/drizzle-adapter",
			Bun.resolveSync("better-auth", import.meta.dir),
		);
		const packageDir = dirname(dirname(entry));
		const installed = JSON.parse(
			readFileSync(join(packageDir, "package.json"), "utf8"),
		).version;
		const patched = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		).patchedDependencies;

		expect(patched[`@better-auth/drizzle-adapter@${installed}`]).toBeString();
		expect(readFileSync(entry, "utf8")).toContain(
			".where(and(inArray(idColumn, targetIds), ...clause))",
		);
	});
});
