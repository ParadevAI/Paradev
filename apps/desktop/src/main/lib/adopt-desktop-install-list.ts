import fs from "node:fs";
import path from "node:path";
import {
	adoptInstalledPlugins,
	installedPluginsFilePath,
} from "@superset/agent-setup";
import type { InstalledPlugin } from "@superset/shared/plugins";

function readSeen(marker: string): Set<string> {
	try {
		const names = JSON.parse(fs.readFileSync(marker, "utf-8"));
		return new Set(Array.isArray(names) ? names : []);
	} catch {
		return new Set();
	}
}

/**
 * Until installed_plugins.json was the only record, the desktop also kept its
 * installs in local-db settings, and a failed CLI step left some only there.
 * Copies each entry into the file the first time it is seen. The column is
 * left as it was, so a build from before the move still reads and writes its
 * own list, and what it adds there is copied on the next boot here. A plugin
 * removed here is not copied back, because it was already seen. A failure
 * leaves the marker unchanged, so the next boot tries again. Returns the
 * names it copied.
 */
export function adoptDesktopInstallList(
	list: readonly InstalledPlugin[],
	ledgerFile: string = installedPluginsFilePath(),
): string[] {
	const marker = path.join(path.dirname(ledgerFile), ".desktop-list-adopted");
	const seen = readSeen(marker);
	const unseen = list.filter((entry) => !seen.has(entry.name));
	const moved = unseen.length ? adoptInstalledPlugins(unseen, ledgerFile) : [];
	if (unseen.length || !fs.existsSync(marker)) {
		fs.mkdirSync(path.dirname(marker), { recursive: true });
		fs.writeFileSync(
			marker,
			JSON.stringify([...new Set([...seen, ...list.map((e) => e.name)])]),
		);
	}
	return moved;
}
