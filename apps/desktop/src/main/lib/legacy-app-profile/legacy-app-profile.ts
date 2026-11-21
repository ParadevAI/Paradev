import { existsSync } from "node:fs";
import { join } from "node:path";

const LEGACY_APP_NAME = "Superset";

export function shouldUseLegacyAppProfile(
	appDataDir: string,
	appName: string,
	exists: (path: string) => boolean = existsSync,
): boolean {
	if (appName === LEGACY_APP_NAME) return false;
	return (
		exists(join(appDataDir, LEGACY_APP_NAME)) &&
		!exists(join(appDataDir, appName))
	);
}

export function pinLegacyAppProfile(app: {
	name: string;
	getPath(name: "appData"): string;
	setName(name: string): void;
}): void {
	if (shouldUseLegacyAppProfile(app.getPath("appData"), app.name)) {
		app.setName(LEGACY_APP_NAME);
	}
}
