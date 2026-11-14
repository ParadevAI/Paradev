import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the bun patch on @legendapp/list (patches/README.md). patchedDependencies
// is keyed to an exact version, so a bump silently drops the patch.
const repoRoot = join(import.meta.dir, "../..");
const patched: Record<string, string> =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
		.patchedDependencies ?? {};
const lockfile = readFileSync(join(repoRoot, "bun.lock"), "utf8");
const RETRY_ON_ANDROID =
	'const shouldRetryUnalignedEndScroll = Platform.OS !== "web"';

describe("@legendapp/list scrollToEnd patch", () => {
	test("every resolved @legendapp/list version is patched", () => {
		const resolved = [
			...lockfile.matchAll(/"@legendapp\/list": \["@legendapp\/list@([^"]+)"/g),
		].map((match) => `@legendapp/list@${match[1]}`);

		expect(resolved.length).toBeGreaterThan(0);
		for (const version of resolved) {
			expect(patched[version]).toBeString();
		}
	});

	test("the installed package retries an unaligned scrollToEnd on Android", () => {
		const packageRoot = join(import.meta.dir, "node_modules/@legendapp/list");
		for (const file of ["react-native.js", "react-native.mjs"]) {
			expect(readFileSync(join(packageRoot, file), "utf8")).toContain(
				RETRY_ON_ANDROID,
			);
		}
	});
});
