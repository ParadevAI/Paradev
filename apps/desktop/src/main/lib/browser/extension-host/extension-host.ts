import { BrowserWindow, session } from "electron";
import { ElectronChromeExtensions } from "electron-chrome-extensions";
import { BROWSER_PARTITION } from "shared/constants";
import { watchWindows } from "../../window-registry/window-registry";
import { browserManager, isAllowedGuestUrl } from "../browser-manager";
import {
	attachBrowserExtensions,
	notifyBrowserExtensionsChanged,
	removeBrowserExtension,
	setBrowserExtensionPinned,
} from "./browser-extensions";
import {
	type ExtensionWindowOptions,
	openExtensionWindow,
} from "./extension-window";
import { serveOffscreenDocuments } from "./offscreen-documents";
import { confirmPermissionRequest } from "./permission-request";
import { waitForNewPane } from "./wait-for-new-pane";
import { installBrowserWebStore } from "./web-store";

type HostTab =
	| { kind: "pane"; paneId: string }
	| { kind: "window"; window: BrowserWindow };

type TabEntry = [Electron.WebContents, BrowserWindow];

function hostWindowOf(contents: Electron.WebContents): BrowserWindow | null {
	return BrowserWindow.fromWebContents(contents.hostWebContents ?? contents);
}

/**
 * Chrome extension APIs for the browser pane's session. Panes are the
 * extensions' tabs; anything else an extension opens gets its own window.
 */
export function initBrowserExtensionHost(): void {
	try {
		startExtensionHost();
	} catch (error) {
		console.error("[extension-host] Failed to start:", error);
	}
}

function startExtensionHost(): void {
	const browserSession = session.fromPartition(BROWSER_PARTITION);
	const paneTabs = new Map<string, Electron.WebContents>();
	const extensionWindows = new Set<BrowserWindow>();
	let activePaneId: string | null = null;

	const hostTabOf = (contents: Electron.WebContents): HostTab | null => {
		for (const [paneId, paneContents] of paneTabs) {
			if (paneContents === contents) return { kind: "pane", paneId };
		}
		const window = BrowserWindow.fromWebContents(contents);
		return window && extensionWindows.has(window)
			? { kind: "window", window }
			: null;
	};

	const openWindow = (options: ExtensionWindowOptions): BrowserWindow => {
		const window = openExtensionWindow(browserSession, options, (url) => {
			void openTab(url).catch((error: unknown) => {
				console.error("[extension-host] Failed to open tab:", error);
			});
		});
		extensionWindows.add(window);
		window.once("closed", () => extensionWindows.delete(window));
		extensions.addTab(window.webContents, window);
		return window;
	};

	const openPaneTab = async (
		openerPaneId: string,
		url: string,
	): Promise<TabEntry> => {
		const workspaceId =
			browserManager.listPanes().find((pane) => pane.paneId === openerPaneId)
				?.workspaceId ?? null;
		const registered = waitForNewPane(workspaceId, browserSession);
		browserManager.openInNewPane(openerPaneId, url);
		const contents = browserManager.getWebContents(await registered);
		const window = contents && hostWindowOf(contents);
		if (!contents || !window) {
			throw new Error("The extension's new pane closed before it loaded");
		}
		return [contents, window];
	};

	const openTab = async (
		url: string,
		openerTabId?: number,
	): Promise<TabEntry> => {
		const opener =
			[...paneTabs].find(([, contents]) => contents.id === openerTabId)?.[0] ??
			activePaneId;
		if (opener && isAllowedGuestUrl(url)) return openPaneTab(opener, url);
		const window = openWindow({ url });
		return [window.webContents, window];
	};

	serveOffscreenDocuments(browserSession);

	const extensions = new ElectronChromeExtensions({
		session: browserSession,
		createTab: (details) =>
			openTab(details.url ?? "about:blank", details.openerTabId),
		removeTab: (tab) => {
			if (tab.isDestroyed()) return;
			const hostTab = hostTabOf(tab);
			if (hostTab?.kind === "pane") browserManager.requestClose(hostTab.paneId);
			if (hostTab?.kind === "window") hostTab.window.close();
		},
		createWindow: async (details) =>
			openWindow({
				url:
					(Array.isArray(details.url) ? details.url[0] : details.url) ??
					"about:blank",
				width: details.width,
				height: details.height,
				left: details.left,
				top: details.top,
				focused: details.focused,
			}),
		removeWindow: (window) => {
			if (window instanceof BrowserWindow && extensionWindows.has(window)) {
				if (!window.isDestroyed()) window.close();
			}
		},
		requestPermissions: confirmPermissionRequest,
	});

	watchWindows((window) => extensions.addWindow(window));

	try {
		attachBrowserExtensions({
			session: browserSession,
			extensions,
			tabOf: (paneId) => paneTabs.get(paneId),
		});
	} catch (error) {
		console.error("[extension-host] Toolbar actions unavailable:", error);
	}

	// Listeners run inside BrowserManager.register(), so a throw here would
	// fail the pane's own registration.
	const onPaneEvent = (event: string, handler: (paneId: string) => void) => {
		browserManager.on(event, ({ paneId }: { paneId: string }) => {
			try {
				handler(paneId);
			} catch (error) {
				console.error(`[extension-host] ${event} failed:`, error);
			}
		});
	};
	onPaneEvent("pane-registered", (paneId) => {
		const contents = browserManager.getWebContents(paneId);
		const previous = paneTabs.get(paneId);
		if (previous && previous !== contents) {
			paneTabs.delete(paneId);
			if (!previous.isDestroyed()) extensions.removeTab(previous);
		}
		if (!contents || contents.session !== browserSession) return;
		const window = hostWindowOf(contents);
		if (!window) return;
		paneTabs.set(paneId, contents);
		extensions.addTab(contents, window);
		activePaneId = paneId;
		notifyBrowserExtensionsChanged();
	});
	onPaneEvent("pane-unregistered", (paneId) => {
		const contents = paneTabs.get(paneId);
		paneTabs.delete(paneId);
		if (activePaneId === paneId) activePaneId = null;
		if (contents && !contents.isDestroyed()) extensions.removeTab(contents);
		notifyBrowserExtensionsChanged();
	});
	onPaneEvent("pane-focused", (paneId) => {
		const contents = paneTabs.get(paneId);
		if (!contents || contents.isDestroyed()) return;
		activePaneId = paneId;
		extensions.selectTab(contents);
	});

	void installBrowserWebStore(browserSession, {
		removeExtension: removeBrowserExtension,
		pinExtension: (extensionId) => setBrowserExtensionPinned(extensionId, true),
	}).catch((error: unknown) => {
		console.error("[extension-host] Chrome Web Store setup failed:", error);
	});
}
