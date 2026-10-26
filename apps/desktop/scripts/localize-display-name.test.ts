import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeLocalizedDisplayName } from "./localize-display-name";

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
