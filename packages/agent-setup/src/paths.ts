import os from "node:os";
import path from "node:path";

/**
 * The one home directory resolver for every process that provisions or
 * consumes the app's per-machine files (Electron main, host-service, CLI,
 * pty daemon). Resolved lazily because the desktop rewrites SUPERSET_HOME_DIR
 * into process.env during boot (dev-workspace builds use ~/.superset-<workspace>),
 * and headless hosts may not have it set at all.
 */
export function resolveAppHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || defaultAppHomeDir();
}

export const APP_HOME_DIR_NAME = ".superset";

export function defaultAppHomeDir(): string {
	return path.join(resolveUserHomeDir(), APP_HOME_DIR_NAME);
}

export function isDefaultAppHomeDir(dir: string | undefined): boolean {
	return (
		!dir?.trim() || path.resolve(dir) === path.resolve(defaultAppHomeDir())
	);
}

/**
 * Node reads $HOME on every os.homedir() call on POSIX; bun reads it once at
 * startup. Reading it here keeps both runtimes the same.
 */
export function resolveUserHomeDir(): string {
	if (process.platform === "win32") return os.homedir();
	return process.env.HOME || os.homedir();
}

export function getBinDir(): string {
	return path.join(resolveAppHomeDir(), "bin");
}

export function getHooksDir(): string {
	return path.join(resolveAppHomeDir(), "hooks");
}

export function getZshDir(): string {
	return path.join(resolveAppHomeDir(), "zsh");
}

export function getBashDir(): string {
	return path.join(resolveAppHomeDir(), "bash");
}

export function getOpenCodeConfigDir(): string {
	return path.join(getHooksDir(), "opencode");
}

export function getOpenCodePluginDir(): string {
	return path.join(getOpenCodeConfigDir(), "plugin");
}
