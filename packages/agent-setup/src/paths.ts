import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_HOME_DIR_NAME = ".paradev";

/**
 * The one home directory resolver for every process that provisions or
 * consumes the app's per-machine files (Electron main, host-service, CLI,
 * pty daemon). Resolved lazily because the desktop rewrites SUPERSET_HOME_DIR
 * into process.env during boot, and headless hosts may not have it set at all.
 */
export function resolveAppHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || defaultAppHomeDir();
}

export function defaultAppHomeDir(): string {
	return path.join(resolveUserHomeDir(), APP_HOME_DIR_NAME);
}

/** Also true for the pre-rename `~/.superset`, which is a link to it once moved. */
export function isDefaultAppHomeDir(dir: string | undefined): boolean {
	if (!dir?.trim()) return true;
	const resolved = path.resolve(dir);
	const defaults = [
		defaultAppHomeDir(),
		path.join(resolveUserHomeDir(), ".superset"),
	];
	return (
		defaults.includes(resolved) ||
		defaults.map(realPath).includes(realPath(resolved))
	);
}

function realPath(dir: string): string {
	try {
		return fs.realpathSync(dir);
	} catch {
		return dir;
	}
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
