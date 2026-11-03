import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { PendingInstalled } from "shared/browser-extension-installed";

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
	/** What runtime.onInstalled still owes this version; nothing is recorded until it is delivered. */
	pendingInstalled(extension: ExtensionRef): PendingInstalled | null;
	markInstalledDelivered(extension: ExtensionRef, version: string): void;
	restoreMenus(extension: ExtensionRef): MenuItemProps[] | null;
	saveMenus(extension: ExtensionRef, items: MenuItemProps[]): void;
	forget(extensionId: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The saved state without malformed entries; "missing" when there is none or it is corrupt, which is moved aside. */
function readState(filePath: string): StateFile | "missing" | "unreadable" {
	let text: string;
	try {
		text = readFileSync(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
		console.error(
			"[extension-host] Could not read extension state; it is left as is:",
			error,
		);
		return "unreadable";
	}
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(text);
	} catch {}
	if (!isRecord(parsed)) {
		console.error(
			`[extension-host] Extension state is corrupt; moved to ${filePath}.corrupt`,
		);
		try {
			renameSync(filePath, `${filePath}.corrupt`);
		} catch {}
		return "missing";
	}
	const installed: StateFile["installed"] = {};
	for (const [id, version] of Object.entries(
		isRecord(parsed.installed) ? parsed.installed : {},
	)) {
		if (typeof version === "string" || version === null) {
			installed[id] = version;
		}
	}
	const menus: StateFile["menus"] = {};
	for (const [id, saved] of Object.entries(
		isRecord(parsed.menus) ? parsed.menus : {},
	)) {
		if (
			isRecord(saved) &&
			typeof saved.version === "string" &&
			Array.isArray(saved.items) &&
			saved.items.every(isRecord)
		) {
			menus[id] = { version: saved.version, items: saved.items };
		}
	}
	return { installed, menus };
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
	let state: StateFile = { installed: {}, menus: {} };
	// Off when what was installed before is unknown: nothing is saved over the
	// file, and no onInstalled fires with a reason that could be wrong.
	let known = true;
	const save = () => {
		if (!known) return;
		const temp = `${filePath}.tmp`;
		try {
			writeFileSync(temp, JSON.stringify(state));
			renameSync(temp, filePath);
		} catch (error) {
			console.error("[extension-host] Could not save extension state:", error);
		}
	};
	const saved = readState(filePath);
	if (saved === "unreadable") {
		known = false;
	} else if (saved === "missing") {
		try {
			state.installed = Object.fromEntries(
				installedBefore().map((id) => [id, null]),
			);
			save();
		} catch (error) {
			console.error(
				"[extension-host] Could not list installed extensions:",
				error,
			);
			known = false;
		}
	} else {
		state = saved;
	}

	return {
		pendingInstalled({ id, version }) {
			if (!known) return null;
			const seen = state.installed[id];
			if (seen === version) return null;
			if (seen === undefined)
				return { details: { reason: "install" }, version };
			if (seen === null) {
				return { details: { reason: "chrome_update" }, version };
			}
			return {
				details: { reason: "update", previousVersion: seen },
				version,
			};
		},
		markInstalledDelivered({ id, version }, delivered) {
			if (delivered !== version || state.installed[id] === version) return;
			state.installed[id] = version;
			save();
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
