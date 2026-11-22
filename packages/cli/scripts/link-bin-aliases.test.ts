import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkBinAliases } from "./link-bin-aliases";

describe("linkBinAliases", () => {
	const binDir = mkdtempSync(join(tmpdir(), "superset-bin-"));
	afterAll(() => rmSync(binDir, { recursive: true, force: true }));

	it("points paradev at the superset binary, and relinks on a rebuild", () => {
		writeFileSync(join(binDir, "superset"), "");
		linkBinAliases(binDir);
		linkBinAliases(binDir);
		expect(realpathSync(join(binDir, "paradev"))).toBe(
			realpathSync(join(binDir, "superset")),
		);
	});
});
