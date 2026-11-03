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
		callDnr?: unknown;
		chrome?: Record<string, unknown>;
	} = {},
): MainWorld {
	const { protocol, hostname } = new URL(url);
	const [, callOffscreen, toChrome, signInHost, toFirefox, callDnr, ...rest] =
		args;
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
			toChrome,
			signInHost,
			toFirefox,
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
	const done = mock(() => undefined);
	dnr.updateDynamicRules({ removeRuleIds: [1] }, done);
	await Promise.resolve();
	await Promise.resolve();
	expect(callDnr).toHaveBeenLastCalledWith("updateDynamicRules", [
		{ removeRuleIds: [1] },
	]);
	expect(done).toHaveBeenCalled();

	expect(
		runInMainWorld(shim, "chrome-extension://abc/background.js", {
			isServiceWorker: true,
		}).chrome.declarativeNetRequest,
	).toBeUndefined();
});
