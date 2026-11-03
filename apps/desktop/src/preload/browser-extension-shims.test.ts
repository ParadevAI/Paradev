import { expect, type Mock, mock, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { contextBridge } from "electron";

interface MainWorld {
	location: { protocol: string; hostname: string };
	navigator: Record<string, unknown>;
	chrome: Record<string, unknown>;
	browser?: unknown;
}

interface Shim {
	func: (...args: unknown[]) => void;
	args: unknown[];
}

// A service worker's preload realm has neither `navigator` nor `location`.
async function importInWorkerPreloadRealm(): Promise<Shim> {
	const hidden = ["navigator", "location"].map((name) => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, {
			value: undefined,
			configurable: true,
		});
		return [name, descriptor] as const;
	});
	try {
		await import("./browser-extension-shims");
	} finally {
		for (const [name, descriptor] of hidden) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		}
	}
	const calls = (contextBridge.executeInMainWorld as Mock<() => void>).mock
		.calls as unknown as [Shim][];
	const shim = calls.at(-1)?.[0];
	if (!shim) throw new Error("the preload never reached the main world");
	return shim;
}

// Electron runs `func` from its source in the page's or worker's own realm.
function runInMainWorld(
	{ func, args }: Shim,
	url: string,
	overrides: {
		isServiceWorker?: boolean;
		callOffscreen?: unknown;
		chrome?: Record<string, unknown>;
		sendNative?: unknown;
		listenNative?: unknown;
		callDnr?: unknown;
	} = {},
): MainWorld {
	const { protocol, hostname } = new URL(url);
	const [
		,
		callOffscreen,
		toChromeUserAgent,
		googleSignInHost,
		toFirefoxUserAgent,
		sendNative,
		listenNative,
		maxMessageLength,
		callDnr,
		...rest
	] = args;
	const world = {
		location: { protocol, hostname },
		navigator: {
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.167 Electron/44.9.3 Safari/537.36",
			vendor: "Google Inc.",
			userAgentData: { brands: [{ brand: "Chromium", version: "152" }] },
		},
		chrome: overrides.chrome ?? {},
		args: [
			overrides.isServiceWorker ?? false,
			overrides.callOffscreen ?? callOffscreen,
			toChromeUserAgent,
			googleSignInHost,
			toFirefoxUserAgent,
			overrides.sendNative ?? sendNative,
			overrides.listenNative ?? listenNative,
			maxMessageLength,
			overrides.callDnr ?? callDnr,
			...rest,
		],
	};
	runInNewContext(`(${func.toString()})(...args)`, world);
	return world;
}

test("`browser` is the patched `chrome` in extension contexts only, even from a preload realm with no `location`", async () => {
	const shim = await importInWorkerPreloadRealm();

	const extensionPage = runInMainWorld(
		shim,
		"chrome-extension://abc/popup.html",
	);
	expect(extensionPage.browser).toBe(extensionPage.chrome);
	expect(runInMainWorld(shim, "https://example.com/").browser).toBeUndefined();

	// 1Password's app assigns its own polyfill in strict mode.
	const polyfill = {};
	runInNewContext(
		'"use strict"; globalThis.browser = polyfill;',
		Object.assign(extensionPage, { polyfill }),
	);
	expect(extensionPage.browser).toBe(polyfill);
});

test("an extension service worker gets chrome.offscreen and Chrome's user agent; websites do not", async () => {
	const shim = await importInWorkerPreloadRealm();
	const callOffscreen = mock(async () => undefined);

	const worker = runInMainWorld(shim, "chrome-extension://abc/background.js", {
		isServiceWorker: true,
		callOffscreen,
	});
	expect(worker.navigator.userAgent).toContain("Chrome/152.0.0.0");
	expect(worker.navigator.userAgent).not.toContain("Electron");
	const offscreen = worker.chrome.offscreen as {
		createDocument: (params: unknown) => Promise<unknown>;
	};
	await offscreen.createDocument({ url: "offscreen.html" });

	expect(callOffscreen).toHaveBeenCalledWith("createDocument", {
		url: "offscreen.html",
	});
	expect(
		runInMainWorld(shim, "https://example.com/", { isServiceWorker: true })
			.chrome.offscreen,
	).toBeUndefined();
});

test("Google's sign-in page sees Firefox, with no Chromium brands to cross-check", async () => {
	const shim = await importInWorkerPreloadRealm();

	const google = runInMainWorld(shim, "https://accounts.google.com/v3/signin");
	expect(google.navigator.userAgent).toContain("Firefox/154.0");
	expect(google.navigator.userAgentData).toBeUndefined();
	expect(google.navigator.vendor).toBe("");
	const website = runInMainWorld(shim, "https://example.com/").navigator;
	expect(website.userAgent).toContain("Electron");
	expect(website.userAgentData).toBeDefined();
});

interface NativePort {
	onMessage: { addListener(listener: (message: unknown) => void): void };
	onDisconnect: { addListener(listener: () => void): void };
	postMessage(message: unknown): void;
	disconnect(): void;
}
interface NativeRuntime {
	lastError?: { message: string };
	connectNative?: (application: string) => NativePort;
	sendNativeMessage?: (
		application: string,
		message: unknown,
		callback?: (response?: unknown) => void,
	) => Promise<unknown> | undefined;
}

function nativeWorld(
	shim: Shim,
	url: string,
	permissions: string[] = ["nativeMessaging"],
) {
	const sent: unknown[][] = [];
	let deliver: (portId: number, event: unknown) => void = () => {};
	const runtime: NativeRuntime & Record<string, unknown> = {
		getManifest: () => ({ permissions }),
	};
	runInMainWorld(shim, url, {
		isServiceWorker: true,
		chrome: { runtime },
		sendNative: (...args: unknown[]) => sent.push(args),
		listenNative: (listener: typeof deliver) => {
			deliver = listener;
		},
	});
	return {
		runtime,
		sent,
		deliver: (portId: number, event: unknown) => deliver(portId, event),
	};
}

test("only an extension that declares nativeMessaging gets connectNative", async () => {
	const shim = await importInWorkerPreloadRealm();
	const extension = nativeWorld(shim, "chrome-extension://abc/background.js");
	expect(typeof extension.runtime.connectNative).toBe("function");
	expect(typeof extension.runtime.sendNativeMessage).toBe("function");
	// electron-chrome-extensions replaces runtime with a spread copy.
	expect({ ...extension.runtime }.connectNative).toBe(
		extension.runtime.connectNative,
	);

	for (const world of [
		nativeWorld(shim, "chrome-extension://abc/background.js", ["storage"]),
		nativeWorld(shim, "https://example.com/"),
	]) {
		expect(world.runtime.connectNative).toBeUndefined();
		expect(world.runtime.sendNativeMessage).toBeUndefined();
	}
});

test("a native port relays JSON and reports a host's exit through runtime.lastError", async () => {
	const shim = await importInWorkerPreloadRealm();
	const { runtime, sent, deliver } = nativeWorld(
		shim,
		"chrome-extension://abc/background.js",
	);
	const port = runtime.connectNative?.("com.example.host") as NativePort;
	const received: unknown[] = [];
	let disconnectError: string | undefined;
	port.onMessage.addListener((message) => received.push(message));
	port.onDisconnect.addListener(() => {
		disconnectError = runtime.lastError?.message;
	});
	port.postMessage({ hello: "wörld" });
	expect(sent).toEqual([
		["connect", 1, "com.example.host"],
		["post", 1, '{"hello":"wörld"}'],
	]);

	deliver(1, { type: "message", json: '{"ok":true}' });
	deliver(1, { type: "disconnect", error: "Native host has exited." });
	expect(received).toEqual([{ ok: true }]);
	expect(disconnectError).toBe("Native host has exited.");
	expect(runtime.lastError).toBeUndefined();
	expect(() => port.postMessage({})).toThrow("disconnected port");
});

test("sendNativeMessage closes the port after the first reply and reports failures", async () => {
	const shim = await importInWorkerPreloadRealm();
	const { runtime, sent, deliver } = nativeWorld(
		shim,
		"chrome-extension://abc/background.js",
	);
	const reply = runtime.sendNativeMessage?.("com.example.host", { q: 1 });
	deliver(1, { type: "message", json: '"first"' });
	deliver(1, { type: "message", json: '"second"' });
	expect(await reply).toBe("first");
	expect(sent.at(-1)).toEqual(["disconnect", 1]);

	let callbackError: string | undefined;
	const done = new Promise<void>((resolve) => {
		runtime.sendNativeMessage?.("com.example.missing", {}, () => {
			callbackError = runtime.lastError?.message;
			resolve();
		});
	});
	deliver(2, {
		type: "disconnect",
		error: "Specified native messaging host not found.",
	});
	await done;
	expect(callbackError).toBe("Specified native messaging host not found.");
});

test("an extension's chrome.declarativeNetRequest calls main and keeps Chrome's constants", async () => {
	const shim = await importInWorkerPreloadRealm();
	const callDnr = mock(async () => ["ublock-filters"]);
	const nativeDnr = {
		MAX_NUMBER_OF_REGEX_RULES: 1000,
		RuleActionType: { BLOCK: "block" },
		getEnabledRulesets: () => Promise.resolve([]),
	};

	const worker = runInMainWorld(shim, "chrome-extension://abc/background.js", {
		isServiceWorker: true,
		callDnr,
		chrome: { declarativeNetRequest: nativeDnr },
	});
	const dnr = worker.chrome.declarativeNetRequest as Record<string, unknown> & {
		getEnabledRulesets: () => Promise<string[]>;
		updateDynamicRules: (options: unknown, callback: () => void) => void;
	};
	expect(await dnr.getEnabledRulesets()).toEqual(["ublock-filters"]);
	expect(dnr.RuleActionType).toEqual({ BLOCK: "block" });
	expect(dnr.DYNAMIC_RULESET_ID).toBe("_dynamic");
	await new Promise<void>((done) =>
		dnr.updateDynamicRules({ removeRuleIds: [1] }, done),
	);
	expect(callDnr).toHaveBeenLastCalledWith("updateDynamicRules", [
		{ removeRuleIds: [1] },
	]);

	expect(
		runInMainWorld(shim, "chrome-extension://abc/background.js", {
			isServiceWorker: true,
		}).chrome.declarativeNetRequest,
	).toBeUndefined();
});
