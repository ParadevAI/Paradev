import fs from "node:fs";
import path from "node:path";
import {
	adoptInstalledPlugins,
	installedPluginsFilePath,
} from "@superset/agent-setup";
import type { InstalledPlugin } from "@superset/shared/plugins";

/** A missing marker has seen nothing; a damaged one throws rather than copy everything again. */
function readSeen(marker: string): Set<string> {
	let raw: string;
	try {
		raw = fs.readFileSync(marker, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return new Set();
		throw error;
	}
	const names: unknown = JSON.parse(raw);
	if (
		!Array.isArray(names) ||
		!names.every((name): name is string => typeof name === "string")
	) {
		throw new Error(`${marker} is not a list of names`);
	}
	return new Set(names);
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
