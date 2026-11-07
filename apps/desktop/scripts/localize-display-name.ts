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

export function localizeMacDisplayName(displayName: string) {
	return async (context: AfterPackContext) => {
		if (context.electronPlatformName !== "darwin") return;
		const appName = context.packager.appInfo.productFilename;
		if (displayName === appName) return;
		writeLocalizedDisplayName(
			join(context.appOutDir, `${appName}.app`, "Contents", "Resources"),
			displayName,
		);
	};
}
