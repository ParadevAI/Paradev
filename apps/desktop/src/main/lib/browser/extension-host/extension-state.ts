import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { InstalledDetails } from "shared/browser-extension-installed";

export type MenuItemProps = Record<string, unknown>;

interface ExtensionRef {
	id: string;
	version: string;
}

interface StateFile {
	/** The version each extension last got runtime.onInstalled for; null when it was installed before the app kept this file. */
	installed: Record<string, string | null>;
	menus: Record<string, { version: string; items: MenuItemProps[] }>;
}

export interface ExtensionState {
	takeInstalledDetails(extension: ExtensionRef): InstalledDetails | null;
	restoreMenus(extension: ExtensionRef): MenuItemProps[] | null;
	saveMenus(extension: ExtensionRef, items: MenuItemProps[]): void;
	forget(extensionId: string): void;
}

function readState(filePath: string): StateFile | null {
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8"));
		if (parsed && typeof parsed === "object") {
			return { installed: parsed.installed ?? {}, menus: parsed.menus ?? {} };
		}
	} catch {}
	return null;
}

/**
 * What Chrome keeps per extension and Electron does not: right-click menu
 * items, which Chrome restores at start, and the version runtime.onInstalled
 * last fired for, which Electron never fires.
 */
export function createExtensionState(
	filePath: string,
	installedBefore: () => string[],
): ExtensionState {
	let state: StateFile;
	const save = () => {
		const temp = `${filePath}.tmp`;
		try {
			writeFileSync(temp, JSON.stringify(state));
			renameSync(temp, filePath);
		} catch (error) {
			console.error("[extension-host] Could not save extension state:", error);
		}
	};
	const saved = readState(filePath);
	if (saved) {
		state = saved;
	} else {
		state = {
			installed: Object.fromEntries(installedBefore().map((id) => [id, null])),
			menus: {},
		};
		save();
	}

	return {
		takeInstalledDetails({ id, version }) {
			const seen = state.installed[id];
			if (seen === version) return null;
			state.installed[id] = version;
			save();
			if (seen === undefined) return { reason: "install" };
			if (seen === null) return { reason: "chrome_update" };
			return { reason: "update", previousVersion: seen };
		},
		restoreMenus({ id, version }) {
			const saved = state.menus[id];
			if (!saved) return null;
			if (saved.version === version) return saved.items;
			// An update clears them, as in Chrome: onInstalled fires so the extension makes them again.
			delete state.menus[id];
			save();
			return null;
		},
		saveMenus({ id, version }, items) {
			if (items.length > 0) state.menus[id] = { version, items };
			else if (state.menus[id]) delete state.menus[id];
			else return;
			save();
		},
		forget(extensionId) {
			delete state.installed[extensionId];
			delete state.menus[extensionId];
			save();
		},
	};
}
