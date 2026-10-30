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
	const navigatorDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"navigator",
	);
	Object.defineProperty(globalThis, "navigator", {
		value: undefined,
		configurable: true,
	});
	try {
		await import("./browser-extension-shims");
	} finally {
		if (navigatorDescriptor) {
			Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
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
	overrides: { isServiceWorker?: boolean; callOffscreen?: unknown } = {},
): MainWorld {
	const { protocol, hostname } = new URL(url);
	const [, callOffscreen, ...rest] = args;
	const world = {
		location: { protocol, hostname },
		navigator: {
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.167 Electron/44.9.3 Safari/537.36",
		},
		chrome: {},
		args: [
			overrides.isServiceWorker ?? false,
			overrides.callOffscreen ?? callOffscreen,
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
	expect(
		runInMainWorld(shim, "https://example.com/").navigator.userAgent,
	).toContain("Electron");
});
