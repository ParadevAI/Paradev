import { describe, expect, it } from "bun:test";
import { isUserExtension } from "./user-extensions";

describe("isUserExtension", () => {
	it("counts only extensions installed from the Web Store folder", () => {
		const root = "/data/browser-extensions";
		expect(
			isUserExtension({ path: "/data/browser-extensions/abc/1.0_0" }, root),
		).toBe(true);
		expect(
			isUserExtension({ path: "/app/resources/browser-extension" }, root),
		).toBe(false);
		expect(
			isUserExtension({ path: "/data/browser-extensions-old/abc" }, root),
		).toBe(false);
	});
});
