import { chmodSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AfterPackContext } from "electron-builder";

const ANY_EXECUTE_BIT = 0o111;

// The upstream Electron Linux zip stores 0666 and 0777 modes, and
// electron-builder keeps them when it unpacks the zip.
export function normalizeFileModes(dir: string): void {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		const stats = lstatSync(path);
		if (stats.isSymbolicLink()) continue;
		if (stats.isDirectory()) {
			chmodSync(path, 0o755);
			normalizeFileModes(path);
		} else {
			chmodSync(path, stats.mode & ANY_EXECUTE_BIT ? 0o755 : 0o644);
		}
	}
}

export async function normalizeLinuxFileModes(
	context: AfterPackContext,
): Promise<void> {
	if (context.electronPlatformName !== "linux") return;
	chmodSync(context.appOutDir, 0o755);
	normalizeFileModes(context.appOutDir);
}
