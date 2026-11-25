import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AfterPackContext } from "electron-builder";

/**
 * macOS shows a display name other than the bundle's file name only through
 * InfoPlist.strings, and Finder applies it only when the Info.plist
 * CFBundleDisplayName matches the file name.
 */
export function writeLocalizedDisplayName(
	resourcesDir: string,
	displayName: string,
): void {
	const escaped = displayName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const strings = `"CFBundleName" = "${escaped}";\n"CFBundleDisplayName" = "${escaped}";\n`;
	for (const entry of readdirSync(resourcesDir)) {
		if (entry.endsWith(".lproj")) {
			writeFileSync(join(resourcesDir, entry, "InfoPlist.strings"), strings);
		}
	}
}

/**
 * Writes the strings whenever the shown name differs from the Info.plist
 * name, so an install that keeps the file name `<plistDisplayName>.app`
 * also shows `displayName`.
 */
export function localizeMacDisplayName(
	displayName: string,
	plistDisplayName: string,
) {
	return async (context: AfterPackContext) => {
		if (context.electronPlatformName !== "darwin") return;
		if (displayName === plistDisplayName) return;
		const bundleName = context.packager.appInfo.productFilename;
		writeLocalizedDisplayName(
			join(context.appOutDir, `${bundleName}.app`, "Contents", "Resources"),
			displayName,
		);
	};
}
