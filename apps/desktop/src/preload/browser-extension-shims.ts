import { contextBridge, ipcRenderer } from "electron";
import {
	DNR_CHANNEL,
	DNR_CONSTANTS,
	DNR_METHODS,
	type DnrMethod,
} from "shared/browser-extension-dnr";
import {
	INSTALLED_CHANNEL,
	type InstalledDetails,
	type InstalledRequest,
	type PendingInstalled,
} from "shared/browser-extension-installed";
import {
	MAX_EXTENSION_MESSAGE_LENGTH,
	NATIVE_MESSAGING_CHANNEL,
	NATIVE_MESSAGING_EVENT_CHANNEL,
	type NativeMessagingOp,
	type NativePortEvent,
} from "shared/browser-extension-native-messaging";
import {
	OFFSCREEN_CHANNEL,
	type OffscreenMethod,
} from "shared/browser-extension-offscreen";
import { shimChromeStorage } from "shared/browser-extension-storage-shim";
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
		sendNative: (op: NativeMessagingOp, portId: number, arg?: unknown) => void,
		listenNative: (
			listener: (portId: number, event: NativePortEvent) => void,
		) => void,
		maxMessageLength: number,
		callDnr: (method: DnrMethod, args: unknown[]) => unknown,
		dnrMethods: readonly DnrMethod[],
		dnrConstants: Record<string, unknown>,
		installedEvent: (
			...request: InstalledRequest
		) => Promise<PendingInstalled | null>,
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
		// Chrome sets runtime.lastError only while the callback runs.
		// electron-chrome-extensions later swaps chrome.runtime for a copy, so
		// it is looked up per call.
		const withLastError = (message: string | undefined, run: () => void) => {
			const current = global.chrome?.runtime as Record<string, unknown>;
			if (message === undefined || !current) return run();
			const previous = Object.getOwnPropertyDescriptor(current, "lastError");
			try {
				Object.defineProperty(current, "lastError", {
					value: { message },
					configurable: true,
				});
			} catch {
				return run();
			}
			try {
				run();
			} finally {
				if (previous) Object.defineProperty(current, "lastError", previous);
				else delete current.lastError;
			}
		};
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
					// ipcRenderer.invoke prefixes main's message; Chrome reports it bare.
					const result = Promise.resolve(callDnr(method, args)).catch(
						(error: unknown) => {
							throw new Error(
								String(
									(error as { message?: unknown })?.message ?? error,
								).replace(
									/^Error invoking remote method '[^']*': (?:Error: )?/,
									"",
								),
							);
						},
					);
					if (!callback) return result;
					void result.then(callback, (error: Error) =>
						withLastError(error.message, () => callback(undefined)),
					);
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
		// Electron never fires runtime.onInstalled; the app tracks installs and
		// updates, and the worker asks once its first listener is added. The app
		// records the version only after the listeners ran, so a worker that
		// stops first gets the event again.
		const runtime = chrome?.runtime as Record<string, unknown> | undefined;
		if (isServiceWorker && runtime?.onInstalled) {
			type InstalledListener = (details: InstalledDetails) => void;
			const listeners = new Set<InstalledListener>();
			let asked = false;
			runtime.onInstalled = {
				addListener(listener: InstalledListener) {
					listeners.add(listener);
					if (asked) return;
					asked = true;
					installedEvent("pending").then(
						(pending) => {
							if (!pending) return;
							// Asked again by the next listener; nothing ran.
							if (listeners.size === 0) {
								asked = false;
								return;
							}
							for (const each of [...listeners]) {
								try {
									each(pending.details);
								} catch (error) {
									console.error(error);
								}
							}
							installedEvent("delivered", pending.version).catch(
								(error: unknown) => console.error(error),
							);
						},
						(error: unknown) => {
							asked = false;
							console.error(error);
						},
					);
				},
				removeListener(listener: InstalledListener) {
					listeners.delete(listener);
				},
				hasListener: (listener: InstalledListener) => listeners.has(listener),
				hasListeners: () => listeners.size > 0,
			};
		}

		if (!runtime) return;
		// An optional grant can come later through permissions.request, so main
		// checks the grant on each connect.
		let declaresNativeMessaging = false;
		try {
			const manifest = (
				runtime.getManifest as () => {
					permissions?: unknown;
					optional_permissions?: unknown;
				}
			)();
			declaresNativeMessaging = [
				manifest.permissions,
				manifest.optional_permissions,
			].some((list) => Array.isArray(list) && list.includes("nativeMessaging"));
		} catch (error) {
			console.warn("[native-messaging] Cannot read the manifest:", error);
		}
		if (!declaresNativeMessaging) return;

		type Listener = (...args: unknown[]) => void;
		const createEvent = () => {
			const listeners = new Set<Listener>();
			return {
				event: {
					addListener: (listener: Listener) => {
						listeners.add(listener);
					},
					removeListener: (listener: Listener) => {
						listeners.delete(listener);
					},
					hasListener: (listener: Listener) => listeners.has(listener),
					hasListeners: () => listeners.size > 0,
				},
				dispatch: (...args: unknown[]) => {
					for (const listener of [...listeners]) {
						try {
							listener(...args);
						} catch (error) {
							setTimeout(() => {
								throw error;
							});
						}
					}
				},
			};
		};
		type NativeEvent = ReturnType<typeof createEvent>["event"];
		interface NativePort {
			name: string;
			onMessage: NativeEvent;
			onDisconnect: NativeEvent;
			postMessage(message: unknown): void;
			disconnect(): void;
		}

		const handlers = new Map<number, (event: NativePortEvent) => void>();
		const disconnectErrors = new WeakMap<NativePort, string | undefined>();
		let nextPortId = 1;
		let listening = false;
		const connectNative = (application: unknown): NativePort => {
			if (!listening) {
				listening = true;
				listenNative((portId, event) => handlers.get(portId)?.(event));
			}
			const portId = nextPortId++;
			const onMessage = createEvent();
			const onDisconnect = createEvent();
			let connected = true;
			const port: NativePort = {
				name: "",
				onMessage: onMessage.event,
				onDisconnect: onDisconnect.event,
				postMessage: (message) => {
					if (!connected) {
						throw new Error("Attempting to use a disconnected port object");
					}
					const json = JSON.stringify(message === undefined ? null : message);
					if (json === undefined) {
						throw new Error("Could not serialize message.");
					}
					if (new TextEncoder().encode(json).length > maxMessageLength) {
						throw new Error("Message length exceeded maximum allowed length.");
					}
					sendNative("post", portId, json);
				},
				disconnect: () => {
					if (!connected) return;
					connected = false;
					handlers.delete(portId);
					sendNative("disconnect", portId);
				},
			};
			handlers.set(portId, (event) => {
				if (event.type === "message") {
					onMessage.dispatch(JSON.parse(event.json), port);
					return;
				}
				connected = false;
				handlers.delete(portId);
				disconnectErrors.set(port, event.error);
				withLastError(event.error, () => onDisconnect.dispatch(port));
			});
			sendNative("connect", portId, application);
			return port;
		};
		// Chrome closes the port after the host's first reply.
		const sendNativeMessage = (
			application: unknown,
			message: unknown,
			callback?: (response?: unknown) => void,
		) => {
			const reply = new Promise((resolve, reject) => {
				const port = connectNative(application);
				port.onMessage.addListener((response) => {
					port.disconnect();
					resolve(response);
				});
				port.onDisconnect.addListener(() => {
					reject(
						new Error(disconnectErrors.get(port) ?? "Native host has exited."),
					);
				});
				try {
					port.postMessage(message);
				} catch (error) {
					port.disconnect();
					reject(error);
				}
			});
			if (typeof callback !== "function") return reply;
			reply.then(
				(response) => callback(response),
				(error: Error) => withLastError(error.message, () => callback()),
			);
		};
		for (const [name, value] of [
			["connectNative", connectNative],
			["sendNativeMessage", sendNativeMessage],
		] as const) {
			// Enumerable, so electron-chrome-extensions' copy of runtime keeps it.
			Object.defineProperty(runtime, name, {
				value,
				writable: true,
				enumerable: true,
				configurable: true,
			});
		}
	},
	args: [
		process.type === "service-worker",
		(method: OffscreenMethod, params?: unknown) =>
			ipcRenderer.invoke(OFFSCREEN_CHANNEL, method, params),
		chromeUserAgent,
		GOOGLE_SIGN_IN_HOST,
		firefoxUserAgent,
		(op: NativeMessagingOp, portId: number, arg?: unknown) =>
			ipcRenderer.send(NATIVE_MESSAGING_CHANNEL, op, portId, arg),
		(listener: (portId: number, event: NativePortEvent) => void) => {
			ipcRenderer.on(NATIVE_MESSAGING_EVENT_CHANNEL, (_event, portId, event) =>
				listener(portId, event),
			);
		},
		MAX_EXTENSION_MESSAGE_LENGTH,
		(method: DnrMethod, args: unknown[]) =>
			ipcRenderer.invoke(DNR_CHANNEL, method, args),
		DNR_METHODS,
		DNR_CONSTANTS,
		(...request: InstalledRequest) =>
			ipcRenderer.invoke(INSTALLED_CHANNEL, ...request),
	],
});

contextBridge.executeInMainWorld({ func: shimChromeStorage, args: [true] });
