import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const root = join(import.meta.dir, "../..");
const WINDOW_WIDTH_READ =
	/\{[^}]*\bwidth\b[^}]*\}\s*=\s*useWindowDimensions\(\)|useWindowDimensions\(\)\.width/;

describe("window width", () => {
	// The window width counts the iPhone Duo's right-edge status bar column;
	// layout reads the safe-area width from useWideLayout instead.
	test("is read only by useWideLayout", () => {
		const readers = [
			...new Glob("{app,screens,components,hooks}/**/*.{ts,tsx}").scanSync(
				root,
			),
		].filter(
			(file) =>
				!file.startsWith("hooks/useWideLayout/") &&
				WINDOW_WIDTH_READ.test(readFileSync(join(root, file), "utf8")),
		);
		expect(readers).toEqual([]);
	});
});
