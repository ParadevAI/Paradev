import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Guards the bun patch on @vercel/sandbox (patches/README.md).
// patchedDependencies is keyed to an exact version, so a bump silently drops
// the patch, and the SDK then fails to import under Bun. If this fails after
// a bump, re-create the patch per patches/README.md; do NOT delete the test.
const apiClientDir = join(
	dirname(createRequire(import.meta.url).resolve("@vercel/sandbox")),
	"api-client",
);

test.each([
	"base-client.js",
	"base-client.cjs",
])("%s loads undici from the package, not Bun's built-in", (file) => {
	const source = readFileSync(join(apiClientDir, file), "utf8");
	expect(source).toContain('"undici/index.js"');
	expect(source).not.toContain('"undici"');
});

test("the SDK imports under Bun", async () => {
	const { Sandbox } = await import("@vercel/sandbox");
	expect(typeof Sandbox.get).toBe("function");
});
