/**
 * Electron Builder Configuration - Canary Build
 *
 * Extends the base config with canary-specific overrides for internal testing.
 * Can be installed side-by-side with the stable release.
 *
 * @see https://www.electron.build/configuration/configuration
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import baseConfig, {
	displayName as baseDisplayName,
	legacyAppName,
	toInstallerFileName,
} from "./electron-builder";
import pkg from "./package.json";
import { builderProductName } from "./scripts/builder-product-name";
import { localizeMacDisplayName } from "./scripts/localize-display-name";
import { normalizeLinuxFileModes } from "./scripts/normalize-linux-file-modes";

const productName = `${pkg.productName} Canary`;
const legacyProductName = `${legacyAppName} Canary`;
const displayName = `${baseDisplayName} Canary`;
const canaryMacIconPath = join(pkg.resources, "build/icons/icon-canary.icns");
const canaryLinuxIconPath = join(pkg.resources, "build/icons/icon-canary.png");
const canaryWinIconPath = join(pkg.resources, "build/icons/icon-canary.ico");

const config: Configuration = {
	...baseConfig,
	appId: "com.superset.desktop.canary",
	productName: builderProductName({ productName, legacyProductName }),
	afterPack: async (context) => {
		await localizeMacDisplayName(displayName, legacyProductName)(context);
		await normalizeLinuxFileModes(context);
	},

	publish: {
		provider: "github",
		owner: "paradevai",
		repo: "paradev",
		releaseType: "prerelease",
	},

	dmg: {
		...baseConfig.dmg,
		title: displayName,
		artifactName: `${toInstallerFileName(displayName)}-\${version}-\${arch}.\${ext}`,
	},

	mac: {
		...baseConfig.mac,
		...(existsSync(canaryMacIconPath) ? { icon: canaryMacIconPath } : {}),
		artifactName: `Paradev-Canary-\${version}-\${arch}.\${ext}`,
		extendInfo: {
			...baseConfig.mac?.extendInfo,
			CFBundleName: productName,
			CFBundleExecutable: legacyProductName,
			CFBundleDisplayName: legacyProductName,
		},
	},

	deb: { ...baseConfig.deb, packageName: "superset-canary" },

	linux: {
		...baseConfig.linux,
		...(existsSync(canaryLinuxIconPath) ? { icon: canaryLinuxIconPath } : {}),
		synopsis: `${pkg.description} (Canary)`,
		desktop: {
			...baseConfig.linux?.desktop,
			entry: { ...baseConfig.linux?.desktop?.entry, Name: displayName },
		},
		artifactName: `paradev-canary-\${version}-\${arch}.\${ext}`,
	},

	win: {
		...baseConfig.win,
		...(existsSync(canaryWinIconPath) ? { icon: canaryWinIconPath } : {}),
		artifactName: `Paradev-Canary-\${version}-\${arch}.\${ext}`,
	},
};

export default config;
