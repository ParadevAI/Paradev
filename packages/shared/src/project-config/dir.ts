import { existsSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_PROJECT_CONFIG_DIR, PROJECT_CONFIG_DIR } from "./constants";

const MAIN_CONFIG_FILES = ["config.toml", "config.json"];
const OTHER_CONFIG_FILES = [
	"config.local.toml",
	"config.local.json",
	"ports.json",
	"setup.sh",
	"teardown.sh",
	"run.sh",
	"start.sh",
];

function hasAny(dir: string, files: string[]): boolean {
	return files.some((file) => existsSync(join(dir, file)));
}

/**
 * The config folder a checkout uses. The main config file decides first, so
 * a stray `ports.json` or local overlay in `.paradev/` never hides a repo's
 * `.superset/config.toml`; then any other config file; then `.paradev` for
 * new config. Folders are judged by these files, not by existing: pdev keeps
 * its own settings and prompts in `<repo>/.paradev/` too.
 */
export function resolveProjectConfigDirName(root: string): string {
	const current = join(root, PROJECT_CONFIG_DIR);
	const legacy = join(root, LEGACY_PROJECT_CONFIG_DIR);
	for (const files of [MAIN_CONFIG_FILES, OTHER_CONFIG_FILES]) {
		if (hasAny(current, files)) return PROJECT_CONFIG_DIR;
		if (hasAny(legacy, files)) return LEGACY_PROJECT_CONFIG_DIR;
	}
	return PROJECT_CONFIG_DIR;
}

export function resolveProjectConfigDir(root: string): string {
	return join(root, resolveProjectConfigDirName(root));
}
