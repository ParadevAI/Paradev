import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { CodeView, parsePatchFiles } = await import("@pierre/diffs");

// Guards the bun patch on @pierre/diffs (patches/README.md). Items subscribe
// to the shared worker pool's theme set; without the patch, cleanUp leaves the
// ones outside the rendered range there, and they keep the whole view alive.
// If this fails after a version bump, regenerate the patch or drop it once
// upstream cleans every item in reset(); do NOT delete the test.
const PATCH = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`;

describe("@pierre/diffs CodeView cleanUp patch", () => {
	test("cleanUp unsubscribes every item from theme changes", () => {
		const subscribers = new Set<unknown>();
		const themeMethods: Record<string, (instance: unknown) => unknown> = {
			subscribeToThemeChanges: (instance) => {
				subscribers.add(instance);
				return () => subscribers.delete(instance);
			},
			unsubscribeToThemeChanges: (instance) => subscribers.delete(instance),
		};
		// Every other pool call answers "no working pool".
		const pool = new Proxy(themeMethods, {
			get: (target, key: string) => target[key] ?? (() => false),
		});
		const fileDiff = parsePatchFiles(PATCH)[0]?.files[0];
		if (!fileDiff) throw new Error("patch did not parse");
		const view = new CodeView(
			{},
			pool as unknown as ConstructorParameters<typeof CodeView>[1],
		);
		view.setItems(
			Array.from({ length: 5 }, (_, i) => ({
				type: "diff" as const,
				id: `item-${i}`,
				fileDiff,
			})),
		);
		const items = (
			view as unknown as { items: { instance: { virtualizedSetup(): void } }[] }
		).items;
		expect(items).toHaveLength(5);
		for (const item of items) item.instance.virtualizedSetup();
		expect(subscribers.size).toBeGreaterThanOrEqual(5);

		view.cleanUp();

		expect(subscribers.size).toBe(0);
	});
});
