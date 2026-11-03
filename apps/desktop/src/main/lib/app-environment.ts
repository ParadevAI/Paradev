import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { moveLegacyAppHome } from "@superset/agent-setup/legacy-home-move";
import { resolveUserHomeDir } from "@superset/agent-setup/paths";
import { getWorkspaceName } from "shared/env.shared";

const workspace = getWorkspaceName();
if (workspace && !process.env.SUPERSET_HOME_DIR?.trim()) {
	process.env.SUPERSET_HOME_DIR = join(
		resolveUserHomeDir(),
		`.paradev-${workspace}`,
	);
}
const appHome = moveLegacyAppHome();
if (appHome.move === "moved") {
	console.log("[app-environment] Moved the app home to", appHome.homeDir);
} else if (appHome.move === "failed") {
	console.warn(
		"[app-environment] Could not move the app home; using",
		appHome.homeDir,
	);
}

export const SUPERSET_HOME_DIR = appHome.homeDir;

export const SUPERSET_HOME_DIR_MODE = 0o700;
export const SUPERSET_SENSITIVE_FILE_MODE = 0o600;

export function ensureSupersetHomeDirExists(): void {
	if (!existsSync(SUPERSET_HOME_DIR)) {
		mkdirSync(SUPERSET_HOME_DIR, {
			recursive: true,
			mode: SUPERSET_HOME_DIR_MODE,
		});
	}

	// Best-effort repair if the directory already existed with weak permissions.
	try {
		chmodSync(SUPERSET_HOME_DIR, SUPERSET_HOME_DIR_MODE);
	} catch (error) {
		console.warn(
			"[app-environment] Failed to chmod Paradev home dir (best-effort):",
			SUPERSET_HOME_DIR,
			error,
		);
	}
}

// For lowdb - use our own path instead of app.getPath("userData")
export const APP_STATE_PATH = join(SUPERSET_HOME_DIR, "app-state.json");

// Window geometry state (separate from UI state - main process only, sync I/O)
export const WINDOW_STATE_PATH = join(SUPERSET_HOME_DIR, "window-state.json");
