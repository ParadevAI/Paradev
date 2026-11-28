import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AfterPackContext } from "electron-builder";
import { normalizeLinuxFileModes } from "./normalize-linux-file-modes";

const modeOf = (path: string) => statSync(path).mode & 0o7777;

const packedTree = () => {
	const outDir = mkdtempSync(join(tmpdir(), "normalize-modes-"));
	mkdirSync(join(outDir, "locales"));
	writeFileSync(join(outDir, "superset"), "");
	writeFileSync(join(outDir, "chrome-sandbox"), "");
	writeFileSync(join(outDir, "locales", "en-US.pak"), "");
	chmodSync(join(outDir, "superset"), 0o777);
	chmodSync(join(outDir, "chrome-sandbox"), 0o777);
	chmodSync(join(outDir, "locales", "en-US.pak"), 0o666);
	chmodSync(join(outDir, "locales"), 0o777);
	symlinkSync("superset", join(outDir, "link"));
	return outDir;
};

const pack = (appOutDir: string, electronPlatformName: string) =>
	normalizeLinuxFileModes({
		appOutDir,
		electronPlatformName,
	} as AfterPackContext);

describe("normalizeLinuxFileModes", () => {
	test("removes world and group write from the packed Linux app", async () => {
		const outDir = packedTree();

		await pack(outDir, "linux");

		expect(modeOf(join(outDir, "superset"))).toBe(0o755);
		expect(modeOf(join(outDir, "chrome-sandbox"))).toBe(0o755);
		expect(modeOf(join(outDir, "locales"))).toBe(0o755);
		expect(modeOf(join(outDir, "locales", "en-US.pak"))).toBe(0o644);
		expect(lstatSync(join(outDir, "link")).isSymbolicLink()).toBe(true);
	});

	test("leaves other platforms alone", async () => {
		const outDir = packedTree();

		await pack(outDir, "darwin");

		expect(modeOf(join(outDir, "superset"))).toBe(0o777);
	});
});
