import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUNDLE_SRC, buildBundle } from "./build";
import { loadAssets } from "./manifest";

const dist = mkdtempSync(join(tmpdir(), "bundle-"));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

test("a drive-only pin change names a new bundle and re-runs no step", () => {
	const assets = loadAssets(join(BUNDLE_SRC, "assets.json"));
	const before = buildBundle(assets, dist);
	const opencode = assets.opencode;
	if (!opencode) throw new Error("assets.json has no opencode row");
	const after = buildBundle(
		{ ...assets, opencode: { ...opencode, sha256: "0".repeat(64) } },
		dist,
	);
	expect(after.sha256).not.toBe(before.sha256);
	expect(after.steps).toEqual(before.steps);
});
