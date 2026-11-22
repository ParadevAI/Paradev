import { describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedExtensionIds, isUserExtension } from "./user-extensions";

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

describe("installedExtensionIds", () => {
	it("is empty when the install folder does not exist, and throws when it cannot be read", () => {
		const root = mkdtempSync(join(tmpdir(), "installed-ids-"));
		try {
			expect(installedExtensionIds(join(root, "missing"))).toEqual([]);
			const unreadable = join(root, "unreadable");
			mkdirSync(unreadable);
			chmodSync(unreadable, 0o000);
			try {
				expect(() => installedExtensionIds(unreadable)).toThrow();
			} finally {
				chmodSync(unreadable, 0o755);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
