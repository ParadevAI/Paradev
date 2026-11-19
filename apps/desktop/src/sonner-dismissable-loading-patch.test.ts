import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on sonner (#9938, patches/README.md).
// patchedDependencies is keyed to an exact version, so a version bump silently
// drops the patch while everything still builds — these assertions turn that
// into a red test. If this fails after a bump, regenerate the patch per
// patches/README.md; do NOT delete the test.
describe("sonner dismissable loading toast patch", () => {
	const distDir = dirname(
		require.resolve("sonner", {
			paths: [dirname(require.resolve("@superset/ui/sonner"))],
		}),
	);

	for (const name of ["index.js", "index.mjs"] as const) {
		test(`${name} renders the close button on loading toasts`, () => {
			const src = readFileSync(join(distDir, name), "utf8");
			expect(src).toContain("closeButton && !toast.jsx ?");
			expect(src).not.toContain("toastType !== 'loading' ?");
		});

		test(`${name} lets loading toasts be swiped and closed`, () => {
			const src = readFileSync(join(distDir, name), "utf8");
			expect(src).toContain("const disabled = false;");
			expect(src).not.toContain("const disabled = toastType === 'loading';");
		});
	}
});
