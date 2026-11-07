import type { ElectronChromeExtensions } from "electron-chrome-extensions";
import {
	INSTALLED_CHANNEL,
	type InstalledRequest,
} from "shared/browser-extension-installed";
import type { ExtensionState, MenuItemProps } from "./extension-state";

/**
 * Restores an extension's right-click menu items when it loads and keeps
 * them as it changes them, and answers its service worker's onInstalled shim.
 */
export function trackExtensionLifecycle({
	session,
	extensions,
	state,
}: {
	session: Electron.Session;
	extensions: Pick<ElectronChromeExtensions, "on" | "restoreContextMenuItems">;
	state: ExtensionState;
}): void {
	session.extensions.on("extension-loaded", (_event, extension) => {
		const items = state.restoreMenus(extension);
		if (items) extensions.restoreContextMenuItems(extension.id, items);
	});
	extensions.on(
		"context-menus-changed",
		(extensionId: string, items: MenuItemProps[]) => {
			const extension = session.extensions.getExtension(extensionId);
			if (extension) state.saveMenus(extension, items);
		},
	);

	const served = new WeakSet<Electron.ServiceWorkerMain>();
	session.serviceWorkers.on("running-status-changed", ({ versionId }) => {
		const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
		if (
			!worker?.scope.startsWith("chrome-extension://") ||
			served.has(worker)
		) {
			return;
		}
		served.add(worker);
		const extensionId = new URL(worker.scope).host;
		worker.ipc.handle(
			INSTALLED_CHANNEL,
			(_event, ...[method, version]: InstalledRequest) => {
				const extension = session.extensions.getExtension(extensionId);
				if (!extension) return null;
				if (method === "pending") return state.pendingInstalled(extension);
				state.markInstalledDelivered(extension, version);
				return null;
			},
		);
	});
}
