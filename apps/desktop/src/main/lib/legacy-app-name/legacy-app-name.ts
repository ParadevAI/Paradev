import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

/** The app name before the Paradev rename; installs from then keep their profile under it. */
export const LEGACY_APP_NAME = "Superset";

export function resolveBootAppName({
	appName,
	appDataDir,
	exists = existsSync,
}: {
	appName: string;
	appDataDir: string;
	exists?: (dir: string) => boolean;
}): string {
	return exists(path.join(appDataDir, LEGACY_APP_NAME))
		? LEGACY_APP_NAME
		: appName;
}

/** Must run before anything reads userData, logs or safeStorage. */
export function pinLegacyAppName(): void {
	const name = resolveBootAppName({
		appName: app.name,
		appDataDir: app.getPath("appData"),
	});
	if (name !== app.name) app.setName(name);
}
