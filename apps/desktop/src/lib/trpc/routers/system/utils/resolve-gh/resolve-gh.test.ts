import { describe, expect, test } from "bun:test";
import { resolveGh } from "./resolve-gh";

const APP_GH = "/Users/me/.paradev/tools/bin/gh";

describe("resolveGh", () => {
	test("runs the app's copy by path when the gh on PATH is broken", async () => {
		const resolved = await resolveGh({
			appGhPath: APP_GH,
			runVersion: async (command) => {
				if (command === "gh") throw new Error("dyld: Library not loaded");
				return "gh version 2.103.3\n";
			},
		});
		expect(resolved?.command).toBe(APP_GH);
	});

	test("prefers a working gh on PATH, and finds none when neither runs", async () => {
		expect(
			(await resolveGh({ appGhPath: APP_GH, runVersion: async () => "gh" }))
				?.command,
		).toBe("gh");
		expect(
			await resolveGh({
				appGhPath: APP_GH,
				runVersion: async () => {
					throw new Error("ENOENT");
				},
			}),
		).toBeNull();
	});
});
