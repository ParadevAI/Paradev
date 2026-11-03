type Callback = (value?: unknown) => void;
type Items = Record<string, unknown>;
type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type Listener = (...args: unknown[]) => void;

interface NativeArea {
	get(keys: unknown, callback: Callback): void;
	set(items: Items, callback: Callback): void;
	remove(keys: string | string[], callback: Callback): void;
	getBytesInUse(keys: unknown, callback: Callback): void;
	QUOTA_BYTES?: number;
	[method: string]: unknown;
}

interface NativeEvent {
	addListener(listener: Listener): void;
	removeListener(listener: Listener): void;
}

interface ChromeStorageGlobal {
	chrome?: {
		extension?: unknown;
		runtime?: { lastError?: { message?: string } };
		storage?: {
			local?: NativeArea;
			onChanged?: NativeEvent;
			[area: string]: unknown;
		};
	};
	location?: { protocol?: string };
}

/**
 * Electron has no `chrome.storage.sync` or `managed`: every call fails with
 * '"sync" is not available in this instance of Chrome'. Chrome without sign-in
 * keeps sync as a separate local area with its own quota, so this keeps it in
 * `storage.local` under a key prefix that `local` and its events never show.
 *
 * Electron runs this function from its source, in an extension page or
 * service worker and in a content script's world, so it uses nothing from
 * outside its own body.
 */
export function shimChromeStorage(extensionPagesOnly: boolean): void {
	const SYNC_PREFIX = "__superset_storage_sync__:";
	const SYNC_QUOTA = {
		QUOTA_BYTES: 102400,
		QUOTA_BYTES_PER_ITEM: 8192,
		MAX_ITEMS: 512,
		MAX_WRITE_OPERATIONS_PER_HOUR: 1800,
		MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
		MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: 1000000,
	};
	const global = globalThis as unknown as ChromeStorageGlobal;
	if (extensionPagesOnly && global.location?.protocol !== "chrome-extension:") {
		return;
	}
	const chrome = global.chrome;
	// Electron's content scripts have no chrome.extension; Vimium reads this.
	if (chrome && !chrome.extension) {
		chrome.extension = { inIncognitoContext: false };
	}
	const storage = chrome?.storage;
	const local = storage?.local;
	const nativeOnChanged = storage?.onChanged;
	const shimmed = Symbol.for("superset.chromeStorageShim");
	if (!chrome || !storage || !local || !nativeOnChanged) return;
	if ((storage as Record<symbol, unknown>)[shimmed]) return;

	const isSyncKey = (key: string) => key.startsWith(SYNC_PREFIX);
	const toSyncKey = (key: string) => SYNC_PREFIX + key;
	const keyList = (keys: unknown): string[] =>
		typeof keys === "string"
			? [keys]
			: Array.isArray(keys)
				? keys.map(String)
				: Object.keys(keys as object);

	const callNative = (method: string, ...args: unknown[]) =>
		new Promise<unknown>((resolve, reject) => {
			(local[method] as (...rest: unknown[]) => void)(
				...args,
				(value: unknown) => {
					const error = chrome.runtime?.lastError;
					if (error) reject(new Error(error.message));
					else resolve(value);
				},
			);
		});
	const readLocal = async () => (await callNative("get", null)) as Items;
	const readSync = async () => {
		const items: Items = {};
		for (const [key, value] of Object.entries(await readLocal())) {
			if (isSyncKey(key)) items[key.slice(SYNC_PREFIX.length)] = value;
		}
		return items;
	};

	// The callback form reports failures through runtime.lastError, as Chrome does.
	const callWithLastError = (callback: Callback, message: string) => {
		const runtime = chrome.runtime as Record<string, unknown> | undefined;
		let defined = false;
		try {
			if (runtime) {
				Object.defineProperty(runtime, "lastError", {
					value: { message },
					configurable: true,
				});
				defined = true;
			}
		} catch {}
		try {
			callback();
		} finally {
			if (defined && runtime) delete runtime.lastError;
		}
	};
	const api =
		<Args extends unknown[]>(run: (...args: Args) => Promise<unknown>) =>
		(...args: unknown[]) => {
			const callback =
				typeof args.at(-1) === "function" ? (args.pop() as Callback) : null;
			const result = run(...(args as Args));
			if (!callback) return result;
			result.then(
				(value) => callback(value),
				(error: Error) => callWithLastError(callback, error.message),
			);
		};

	const event = (route: (changes: Changes, area: string) => unknown[][]) => {
		const wrappers = new Map<Listener, Listener>();
		return {
			addListener(listener: Listener) {
				if (wrappers.has(listener)) return;
				const wrapper = (changes: unknown, area: unknown) => {
					for (const args of route(changes as Changes, area as string)) {
						listener(...args);
					}
				};
				wrappers.set(listener, wrapper);
				nativeOnChanged.addListener(wrapper);
			},
			removeListener(listener: Listener) {
				const wrapper = wrappers.get(listener);
				if (!wrapper) return;
				wrappers.delete(listener);
				nativeOnChanged.removeListener(wrapper);
			},
			hasListener: (listener: Listener) => wrappers.has(listener),
			hasListeners: () => wrappers.size > 0,
		};
	};
	const splitLocal = (changes: Changes, area: string): [Changes, string][] => {
		if (area !== "local") return [[changes, area]];
		const localChanges: Changes = {};
		const syncChanges: Changes = {};
		for (const [key, change] of Object.entries(changes)) {
			if (isSyncKey(key)) syncChanges[key.slice(SYNC_PREFIX.length)] = change;
			else localChanges[key] = change;
		}
		return (
			[
				[localChanges, "local"],
				[syncChanges, "sync"],
			] as [Changes, string][]
		).filter(([split]) => Object.keys(split).length > 0);
	};
	const areaChanges = (name: string) =>
		event((changes, area) =>
			splitLocal(changes, area)
				.filter(([, split]) => split === name)
				.map(([split]) => [split]),
		);

	const byteSize = (key: string, value: unknown) =>
		new TextEncoder().encode(key + (JSON.stringify(value) ?? "")).length;
	const localKeys = async () =>
		Object.keys(await readLocal()).filter((key) => !isSyncKey(key));

	const sync = {
		...SYNC_QUOTA,
		get: api(async (keys?: unknown) => {
			if (keys === null || keys === undefined) return readSync();
			const names = keyList(keys);
			const found = (await callNative("get", names.map(toSyncKey))) as Items;
			const items: Items =
				typeof keys === "object" && !Array.isArray(keys)
					? { ...(keys as Items) }
					: {};
			for (const name of names) {
				if (toSyncKey(name) in found) items[name] = found[toSyncKey(name)];
			}
			return items;
		}),
		getKeys: api(async () => Object.keys(await readSync())),
		getBytesInUse: api(async (keys?: unknown) => {
			const items = await readSync();
			const names =
				keys === null || keys === undefined
					? Object.keys(items)
					: keyList(keys).filter((name) => name in items);
			return names.reduce(
				(total, name) => total + byteSize(name, items[name]),
				0,
			);
		}),
		set: api(async (items: Items) => {
			const next = { ...(await readSync()), ...items };
			for (const [key, value] of Object.entries(items)) {
				if (byteSize(key, value) > SYNC_QUOTA.QUOTA_BYTES_PER_ITEM) {
					throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
				}
			}
			const total = Object.entries(next).reduce(
				(sum, [key, value]) => sum + byteSize(key, value),
				0,
			);
			if (total > SYNC_QUOTA.QUOTA_BYTES) {
				throw new Error("QUOTA_BYTES quota exceeded");
			}
			if (Object.keys(next).length > SYNC_QUOTA.MAX_ITEMS) {
				throw new Error("MAX_ITEMS quota exceeded");
			}
			const prefixed: Items = {};
			for (const [key, value] of Object.entries(items)) {
				prefixed[toSyncKey(key)] = value;
			}
			await callNative("set", prefixed);
		}),
		remove: api(async (keys: string | string[]) => {
			await callNative("remove", keyList(keys).map(toSyncKey));
		}),
		clear: api(async () => {
			const keys = Object.keys(await readLocal()).filter(isSyncKey);
			if (keys.length > 0) await callNative("remove", keys);
		}),
		onChanged: areaChanges("sync"),
	};

	const shimmedLocal = {
		QUOTA_BYTES: local.QUOTA_BYTES,
		get: api(async (keys?: unknown) => {
			if (keys !== null && keys !== undefined) return callNative("get", keys);
			const items = await readLocal();
			for (const key of Object.keys(items)) {
				if (isSyncKey(key)) delete items[key];
			}
			return items;
		}),
		getKeys: api(localKeys),
		getBytesInUse: api(async (keys?: unknown) =>
			callNative(
				"getBytesInUse",
				keys === null || keys === undefined ? await localKeys() : keys,
			),
		),
		set: api((items: Items) => callNative("set", items)),
		remove: api((keys: string | string[]) => callNative("remove", keys)),
		clear: api(async () => {
			const keys = await localKeys();
			if (keys.length > 0) await callNative("remove", keys);
		}),
		setAccessLevel: api((options: unknown) =>
			callNative("setAccessLevel", options),
		),
		onChanged: areaChanges("local"),
	};

	const readOnly = async () => {
		throw new Error("This is a read-only store.");
	};
	const managed = {
		get: api(async (keys?: unknown) =>
			keys && typeof keys === "object" && !Array.isArray(keys)
				? { ...(keys as Items) }
				: {},
		),
		getKeys: api(async () => []),
		getBytesInUse: api(async () => 0),
		set: api(readOnly),
		remove: api(readOnly),
		clear: api(readOnly),
		onChanged: areaChanges("managed"),
	};

	const areas: Record<string | symbol, unknown> = {
		local: shimmedLocal,
		sync,
		managed,
		onChanged: event(splitLocal),
		[shimmed]: true,
	};
	for (const name of Reflect.ownKeys(areas)) {
		Object.defineProperty(storage, name, {
			value: areas[name],
			enumerable: typeof name === "string",
			writable: true,
			configurable: true,
		});
	}
}
