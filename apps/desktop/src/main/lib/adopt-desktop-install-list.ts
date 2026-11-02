import fs from "node:fs";
import path from "node:path";
import {
	adoptInstalledPlugins,
	installedPluginsFilePath,
} from "@superset/agent-setup";
import type { InstalledPlugin } from "@superset/shared/plugins";

/**
 * Until installed_plugins.json was the only record, the desktop also kept its
 * installs in local-db settings, and a failed CLI step left some only there.
 * Moves them into the file once. The column is left as it was, so a build
 * from before the move still reads its own list; a failure writes no marker,
 * so the next boot tries again. Returns the names it moved.
 */
export function adoptDesktopInstallList(
	list: readonly InstalledPlugin[],
	ledgerFile: string = installedPluginsFilePath(),
): string[] {
	const marker = path.join(path.dirname(ledgerFile), ".desktop-list-adopted");
	if (fs.existsSync(marker)) return [];
	const moved = adoptInstalledPlugins(list, ledgerFile);
	fs.mkdirSync(path.dirname(marker), { recursive: true });
	fs.writeFileSync(marker, "");
	return moved;
}
