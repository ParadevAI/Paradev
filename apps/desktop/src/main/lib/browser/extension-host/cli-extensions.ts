import { BrowserWindow, session } from "electron";
import { BROWSER_PARTITION } from "shared/constants";
import type { UserExtensions } from "../browser-bridge";
import {
	pinnedBrowserExtensionIds,
	removeBrowserExtension,
	setBrowserExtensionPinned,
} from "./browser-extensions";
import { isUserExtension } from "./user-extensions";
import {
	browserExtensionsPath,
	confirmRemoval,
	installWebStoreExtension,
} from "./web-store";

function dialogWindow(): BrowserWindow | undefined {
	return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function usersExtensions(): Electron.Extension[] {
	return session
		.fromPartition(BROWSER_PARTITION)
		.extensions.getAllExtensions()
		.filter((extension) => isUserExtension(extension, browserExtensionsPath()));
}

function installed(extensionId: string): Electron.Extension {
	const extension = usersExtensions().find(({ id }) => id === extensionId);
	if (!extension) throw new Error(`No extension ${extensionId} is installed`);
	return extension;
}

function summary({ id, name, version }: Electron.Extension) {
	return { id, name, version };
}

/** The user's own browser extensions, for the CLI. Installs and removals ask the user in the app. */
export const userExtensions: UserExtensions = {
	list() {
		const pinned = new Set(pinnedBrowserExtensionIds());
		return usersExtensions()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(({ id, name, version }) => ({
				id,
				name,
				version,
				pinned: pinned.has(id),
			}));
	},

	async install(extensionId, signal) {
		const existing = session
			.fromPartition(BROWSER_PARTITION)
			.extensions.getExtension(extensionId);
		if (existing && !isUserExtension(existing, browserExtensionsPath())) {
			throw new Error(`${existing.name} is built into the app`);
		}
		if (existing)
			return { status: "already-installed", extension: summary(existing) };
		const extension = await installWebStoreExtension(
			session.fromPartition(BROWSER_PARTITION),
			extensionId,
			dialogWindow(),
			signal,
		);
		if (!extension) return { status: "declined" };
		return { status: "installed", extension: summary(extension) };
	},

	async remove(extensionId, signal) {
		const { name } = installed(extensionId);
		if (!(await confirmRemoval(name, dialogWindow(), signal))) return false;
		await removeBrowserExtension(extensionId);
		return true;
	},

	setPinned(extensionId, pinned) {
		installed(extensionId);
		setBrowserExtensionPinned(extensionId, pinned);
	},
};
