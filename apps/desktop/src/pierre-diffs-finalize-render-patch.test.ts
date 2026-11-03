import { describe, expect, test } from "bun:test";
import { VirtualizedFile } from "@pierre/diffs";

// Guards the bun patch on @pierre/diffs (patches/README.md). patchedDependencies
// is keyed to an exact version, so a version bump silently drops the patch
// while everything still builds. If this fails after a bump, regenerate the
// patch per patches/README.md; do NOT delete the test.
describe("@pierre/diffs VirtualizedFile.finalizeRender patch", () => {
	const file = (contents: string) => ({ name: "src/a.ts", contents });

	// finalizeRender is protected and only reads these members, so it runs
	// without a DOM.
	const { finalizeRender } = VirtualizedFile.prototype as unknown as {
		finalizeRender(this: unknown): void;
	};
	const finalize = (rendered: object, prepared: object) =>
		finalizeRender.call({
			getRenderedFile: () => rendered,
			pendingRender: { file: prepared },
			isSimpleMode: () => false,
		});

	test("an equal file the renderer returned from its cache is accepted", () => {
		expect(() => finalize(file("same"), file("same"))).not.toThrow();
	});

	test("a different file still throws", () => {
		expect(() => finalize(file("old"), file("new"))).toThrow(
			"rendered a different file than its prepared layout",
		);
	});
});
