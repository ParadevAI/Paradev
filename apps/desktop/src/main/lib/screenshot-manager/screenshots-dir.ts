import { existsSync } from "node:fs";
import { join } from "node:path";

const LEGACY_DIR_NAME = "Superset Screenshots";
const DIR_NAME = "Paradev Screenshots";

export function resolveScreenshotsDir(
	picturesDir: string,
	exists: (path: string) => boolean = existsSync,
): string {
	const legacy = join(picturesDir, LEGACY_DIR_NAME);
	return exists(legacy) ? legacy : join(picturesDir, DIR_NAME);
}
