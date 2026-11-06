import { BrowserWindow, type Session } from "electron";
import { markBrowserPanePopup, shouldOpenAsPopup } from "../popup-window";

const EXTENSION_WINDOW_SCHEMES = new Set([
	"http:",
	"https:",
	"about:",
	"chrome-extension:",
]);

export interface ExtensionWindowOptions {
	url: string;
	width?: number;
	height?: number;
	left?: number;
	top?: number;
	focused?: boolean;
}

function isAllowedUrl(url: string): boolean {
	try {
		return EXTENSION_WINDOW_SCHEMES.has(new URL(url).protocol);
	} catch {
		return false;
	}
}

/**
 * Navigates in place on the browser session instead of the system browser. A
 * sign-in popup stays a real popup, because a pane would drop its opener; any
 * other new window opens as a tab.
 */
export function guardExtensionContents(
	contents: Electron.WebContents,
	openUrl: (url: string) => void,
): void {
	markBrowserPanePopup(contents);
	const guard = (event: Electron.Event, url: string) => {
		if (!isAllowedUrl(url)) event.preventDefault();
	};
	contents.on("will-navigate", guard);
	contents.on("will-redirect", guard);
	contents.setWindowOpenHandler((details) => {
		if (!isAllowedUrl(details.url)) return { action: "deny" };
		if (shouldOpenAsPopup(details)) {
			return {
				action: "allow",
				outlivesOpener: false,
				overrideBrowserWindowOptions: {
					autoHideMenuBar: true,
					fullscreenable: false,
				},
			};
		}
		openUrl(details.url);
		return { action: "deny" };
	});
	contents.on("did-create-window", (child) =>
		guardExtensionContents(child.webContents, openUrl),
	);
}

/**
 * A window for what Chrome shows as an extension's own tab or popup window
 * (1Password's passkey popout is `chrome.windows.create`). Extension pages stay
 * out of panes: the pane refuses `chrome-extension:` URLs, and agents drive
 * panes over CDP.
 */
export function openExtensionWindow(
	session: Session,
	options: ExtensionWindowOptions,
	openUrl: (url: string) => void,
): BrowserWindow {
	if (!isAllowedUrl(options.url)) {
		throw new Error(`Refusing to open ${options.url} in an extension window`);
	}
	const window = new BrowserWindow({
		width: options.width ?? 1024,
		height: options.height ?? 768,
		x: options.left,
		y: options.top,
		show: false,
		autoHideMenuBar: true,
		fullscreenable: false,
		webPreferences: {
			session,
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	const contents = window.webContents;
	guardExtensionContents(contents, openUrl);
	window.once("ready-to-show", () => {
		if (window.isDestroyed()) return;
		if (options.focused === false) window.showInactive();
		else window.show();
	});
	void contents.loadURL(options.url).catch((error: unknown) => {
		const replaced = (error as { code?: unknown }).code === "ERR_ABORTED";
		if (replaced) return;
		console.error("[extension-host] Extension window failed to load:", error);
		if (!window.isDestroyed()) window.close();
	});
	return window;
}
