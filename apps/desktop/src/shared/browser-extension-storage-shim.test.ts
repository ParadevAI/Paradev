import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { shimChromeStorage } from "./browser-extension-storage-shim";

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type Callback = (value?: unknown) => void;
type Area = Record<string, (...args: unknown[]) => Promise<unknown>> & {
	QUOTA_BYTES: number;
	QUOTA_BYTES_PER_ITEM: number;
	onChanged: { addListener(listener: (changes: Changes) => void): void };
};
interface ShimmedChrome {
	extension?: { inIncognitoContext: boolean };
	runtime: { lastError?: { message: string } };
	storage: {
		local: Area;
		sync: Area;
		managed: Area;
		onChanged: {
			addListener(listener: (changes: Changes, area: string) => void): void;
		};
	};
}

/** Electron's chrome.storage as an extension sees it: only `local` works, through callbacks. */
function extensionContext(url: string) {
	const data = new Map<string, unknown>();
	const listeners: Array<(changes: Changes, area: string) => void> = [];
	const runtime: { lastError?: { message: string } } = {};
	const done = (callback: Callback, value?: unknown) =>
		queueMicrotask(() => callback(value));
	const write = (next: Map<string, unknown>) => {
		const changes: Changes = {};
		for (const key of new Set([...data.keys(), ...next.keys()])) {
			if (data.get(key) === next.get(key)) continue;
			changes[key] = { oldValue: data.get(key), newValue: next.get(key) };
		}
		data.clear();
		for (const [key, value] of next) {
			if (value !== undefined) data.set(key, value);
		}
		if (Object.keys(changes).length === 0) return;
		for (const listener of listeners) listener(changes, "local");
	};
	const names = (keys: unknown) =>
		keys == null
			? [...data.keys()]
			: typeof keys === "string"
				? [keys]
				: (keys as string[]);
	const local = {
		QUOTA_BYTES: 10485760,
		get(keys: unknown, callback: Callback) {
			const items: Record<string, unknown> = {};
			for (const key of names(keys)) {
				if (data.has(key)) items[key] = data.get(key);
			}
			done(callback, items);
		},
		set(items: Record<string, unknown>, callback: Callback) {
			write(new Map([...data, ...Object.entries(items)]));
			done(callback);
		},
		remove(keys: unknown, callback: Callback) {
			const next = new Map(data);
			for (const key of names(keys)) next.delete(key);
			write(next);
			done(callback);
		},
		getBytesInUse(keys: unknown, callback: Callback) {
			done(callback, names(keys).length);
		},
	};
	const chrome = {
		runtime,
		storage: {
			local,
			onChanged: {
				addListener: (listener: (changes: Changes, area: string) => void) =>
					listeners.push(listener),
				removeListener: () => {},
			},
		},
	};
	const { protocol } = new URL(url);
	const world = { chrome, location: { protocol }, TextEncoder, queueMicrotask };
	runInNewContext(`(${shimChromeStorage})(true)`, world);
	return { chrome: chrome as unknown as ShimmedChrome, data };
}

test("storage.sync is its own area beside local: keys, clear and onChanged stay apart", async () => {
	const { chrome } = extensionContext(
		"chrome-extension://vimium/background.js",
	);
	const { local, sync } = chrome.storage;
	const events: string[] = [];
	chrome.storage.onChanged.addListener((changes, area) =>
		events.push(`${area}:${Object.keys(changes)}`),
	);
	sync.onChanged.addListener((changes) =>
		events.push(`sync.onChanged:${Object.keys(changes)}`),
	);
	local.onChanged.addListener((changes) =>
		events.push(`local.onChanged:${Object.keys(changes)}`),
	);

	await local.set({ keyMappings: "local value" });
	await sync.set({ keyMappings: "map j scrollDown", searchUrl: "ddg" });

	expect(await sync.get(null)).toEqual({
		keyMappings: "map j scrollDown",
		searchUrl: "ddg",
	});
	expect(await local.get(null)).toEqual({ keyMappings: "local value" });
	expect(await sync.get({ searchUrl: "google", missing: 1 })).toEqual({
		searchUrl: "ddg",
		missing: 1,
	});
	expect(await sync.getKeys()).toEqual(["keyMappings", "searchUrl"]);
	expect(events).toEqual([
		"local:keyMappings",
		"local.onChanged:keyMappings",
		"sync:keyMappings,searchUrl",
		"sync.onChanged:keyMappings,searchUrl",
	]);

	await local.clear();
	expect(await sync.get("searchUrl")).toEqual({ searchUrl: "ddg" });
	await sync.clear();
	expect(await sync.get(null)).toEqual({});
});

test("storage.sync keeps Chrome's quota and its callback form reports errors through lastError", async () => {
	const { chrome, data } = extensionContext(
		"chrome-extension://vimium/pages/options.html",
	);
	const { sync, managed } = chrome.storage;

	const lastError = await new Promise((resolve) =>
		sync.set({ big: "x".repeat(sync.QUOTA_BYTES_PER_ITEM) }, () =>
			resolve(chrome.runtime.lastError?.message),
		),
	);
	expect(lastError).toBe("QUOTA_BYTES_PER_ITEM quota exceeded");
	expect(chrome.runtime.lastError).toBeUndefined();
	expect(data.size).toBe(0);
	await expect(
		sync.set({ big: "x".repeat(sync.QUOTA_BYTES_PER_ITEM) }),
	).rejects.toThrow("QUOTA_BYTES_PER_ITEM");

	const items = await new Promise((resolve) => {
		sync.set({ linkHintCharacters: "sadfjklewcmpgh" }, () =>
			sync.get("linkHintCharacters", resolve),
		);
	});
	expect(items).toEqual({ linkHintCharacters: "sadfjklewcmpgh" });
	expect(await managed.get(null)).toEqual({});
	await expect(managed.set({ a: 1 })).rejects.toThrow("read-only");
});

test("an extension context with no chrome.extension gets inIncognitoContext false, as a non-incognito Chrome", () => {
	const { chrome } = extensionContext("chrome-extension://vimium/lib/utils.js");
	expect(chrome.extension).toEqual({ inIncognitoContext: false });
});
