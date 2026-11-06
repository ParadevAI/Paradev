import fs from "node:fs";
import path from "node:path";
import { getBinDir, resolveUserHomeDir } from "./paths";

const APP_HOME_DIR_NAME_PATTERN = /^\.(?:paradev|superset)(?:-[^/\\]+)?$/;

/** Same skip list as the wrapper's find_real_binary: our wrappers are not the agent. */
function isAppBinDir(dir: string): boolean {
	if (dir === path.resolve(getBinDir())) return true;
	if (path.basename(dir) !== "bin") return false;
	const appHome = path.dirname(dir);
	return (
		path.dirname(appHome) === path.resolve(resolveUserHomeDir()) &&
		APP_HOME_DIR_NAME_PATTERN.test(path.basename(appHome))
	);
}

function isExecutableFile(filePath: string): boolean {
	try {
		if (!fs.statSync(filePath).isFile()) return false;
		fs.accessSync(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function isRealBinaryOnPath(
	binaryNames: readonly string[],
	searchPath: string = process.env.PATH ?? "",
): boolean {
	for (const entry of searchPath.split(path.delimiter)) {
		if (!entry) continue;
		const dir = path.resolve(entry);
		if (isAppBinDir(dir)) continue;
		if (binaryNames.some((name) => isExecutableFile(path.join(dir, name)))) {
			return true;
		}
	}
	return false;
}
