import { contextBridge, ipcRenderer } from "electron";
import {
	OFFSCREEN_CHANNEL,
	type OffscreenMethod,
} from "shared/browser-extension-offscreen";
import {
	chromeUserAgent,
	firefoxUserAgent,
	GOOGLE_SIGN_IN_HOST,
} from "shared/chrome-user-agent";

// Registered before electron-chrome-extensions' preload, which freezes `chrome`
// once it adds its own APIs.
contextBridge.executeInMainWorld({
	func: (
		isServiceWorker: boolean,
		callOffscreen: (method: OffscreenMethod, params?: unknown) => unknown,
		toChromeUserAgent: (userAgent: string) => string,
		googleSignInHost: string,
		toFirefoxUserAgent: (userAgent: string) => string,
	) => {
		// Session preloads run in website frames and workers too. The checks run
		// here because a service worker's preload realm has no `location`.
		if (globalThis.location?.hostname === googleSignInHost) {
			const firefox = toFirefoxUserAgent(navigator.userAgent);
			const page: [string, unknown][] = [
				["userAgent", firefox],
				["appVersion", firefox.slice("Mozilla/".length)],
				["vendor", ""],
				["userAgentData", undefined],
			];
			for (const [name, value] of page) {
				Object.defineProperty(navigator, name, {
					get: () => value,
					configurable: true,
				});
			}
			return;
		}
		if (globalThis.location?.protocol !== "chrome-extension:") return;
		const global = globalThis as { chrome?: Record<string, unknown> };
		// Chromium gives extension contexts their own `browser`, and
		// electron-chrome-extensions patches only `chrome`. The webextension
		// polyfill (1Password) calls `browser`, and may assign its own.
		Object.defineProperty(globalThis, "browser", {
			get: () => global.chrome,
			set: (value: unknown) => {
				Object.defineProperty(globalThis, "browser", {
					value,
					writable: true,
					configurable: true,
				});
			},
			configurable: true,
		});
		const chrome = global.chrome;
		// The session's user agent reaches pages but not service workers.
		if (isServiceWorker) {
			Object.defineProperty(navigator, "userAgent", {
				value: toChromeUserAgent(navigator.userAgent),
				configurable: true,
			});
		}
		// ponytail: promises only, no callback form; add it when an extension needs it.
		if (isServiceWorker && chrome && !chrome.offscreen) {
			chrome.offscreen = {
				Reason: new Proxy({}, { get: (_target, reason) => reason }),
				createDocument: (params: unknown) =>
					callOffscreen("createDocument", params),
				closeDocument: () => callOffscreen("closeDocument"),
				hasDocument: () => callOffscreen("hasDocument"),
			};
		}
	},
	args: [
		process.type === "service-worker",
		(method: OffscreenMethod, params?: unknown) =>
			ipcRenderer.invoke(OFFSCREEN_CHANNEL, method, params),
		chromeUserAgent,
		GOOGLE_SIGN_IN_HOST,
		firefoxUserAgent,
	],
});
