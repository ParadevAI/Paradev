import { contextBridge, ipcRenderer } from "electron";
import {
	DNR_CHANNEL,
	DNR_CONSTANTS,
	DNR_METHODS,
	type DnrMethod,
} from "shared/browser-extension-dnr";
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
		callDnr: (method: DnrMethod, args: unknown[]) => unknown,
		dnrMethods: readonly DnrMethod[],
		dnrConstants: Record<string, unknown>,
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
		// Electron exposes Chromium's chrome.declarativeNetRequest but never
		// enforces its rules; main keeps the rules and enforces them instead.
		const nativeDnr = chrome?.declarativeNetRequest as
			| Record<string, unknown>
			| undefined;
		if (chrome && nativeDnr) {
			const dnr: Record<string, unknown> = { ...dnrConstants };
			for (const key of Object.keys(nativeDnr)) {
				const value = nativeDnr[key];
				if (typeof value !== "function") dnr[key] = value;
			}
			for (const method of dnrMethods) {
				dnr[method] = (...args: unknown[]) => {
					const callback =
						typeof args.at(-1) === "function"
							? (args.pop() as (result: unknown) => void)
							: undefined;
					const result = callDnr(method, args);
					if (!callback) return result;
					void Promise.resolve(result).then(callback, (error: unknown) => {
						console.error(`chrome.declarativeNetRequest.${method}:`, error);
					});
				};
			}
			Object.defineProperty(chrome, "declarativeNetRequest", {
				value: dnr,
				writable: true,
				enumerable: true,
				configurable: true,
			});
		}
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
		(method: DnrMethod, args: unknown[]) =>
			ipcRenderer.invoke(DNR_CHANNEL, method, args),
		DNR_METHODS,
		DNR_CONSTANTS,
	],
});
