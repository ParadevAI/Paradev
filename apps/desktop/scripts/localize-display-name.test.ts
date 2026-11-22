import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AfterPackContext } from "electron-builder";
import {
	localizeMacDisplayName,
	writeLocalizedDisplayName,
} from "./localize-display-name";

describe("writeLocalizedDisplayName", () => {
	test("names the app in every localization folder", () => {
		const dir = mkdtempSync(join(tmpdir(), "localize-display-name-"));
		mkdirSync(join(dir, "en.lproj"));
		mkdirSync(join(dir, "ja.lproj"));
		writeFileSync(join(dir, "icon.icns"), "");

		writeLocalizedDisplayName(dir, "Paradev");

		for (const locale of ["en", "ja"]) {
			expect(
				readFileSync(join(dir, `${locale}.lproj`, "InfoPlist.strings"), "utf8"),
			).toBe(
				'"CFBundleName" = "Paradev";\n"CFBundleDisplayName" = "Paradev";\n',
			);
		}
	});
});

describe("localizeMacDisplayName", () => {
	const pack = async (displayName: string, plistDisplayName: string) => {
		const outDir = mkdtempSync(join(tmpdir(), "localize-after-pack-"));
		const resources = join(outDir, "Paradev.app", "Contents", "Resources");
		mkdirSync(join(resources, "en.lproj"), { recursive: true });
		await localizeMacDisplayName(
			displayName,
			plistDisplayName,
		)({
			electronPlatformName: "darwin",
			appOutDir: outDir,
			packager: { appInfo: { productFilename: "Paradev" } },
		} as unknown as AfterPackContext);
		return existsSync(join(resources, "en.lproj", "InfoPlist.strings"));
	};

	test("localizes when the shown name differs from the Info.plist name", async () => {
		expect(await pack("Paradev", "Superset")).toBe(true);
	});

	test("skips when the shown name equals the Info.plist name", async () => {
		expect(await pack("Superset", "Superset")).toBe(false);
	});
});
