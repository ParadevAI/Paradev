import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	MAX_PAGE_STORAGE_VALUE_BYTES,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "./page-storage";

const HELLO_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 60000;
const CALL_TIMEOUT_MS = 15000;

export function pageStorageRuntimeSource({
	helloTimeoutMs = HELLO_TIMEOUT_MS,
}: {
	helloTimeoutMs?: number;
} = {}): string {
	return `(() => {
	const FRAME = ${JSON.stringify(STORAGE_FRAME_CHANNEL)};
	const HOST = ${JSON.stringify(STORAGE_HOST_CHANNEL)};
	const MAX_VALUE_BYTES = ${MAX_PAGE_STORAGE_VALUE_BYTES};
	const MAX_KEY_LENGTH = ${MAX_PAGE_STORAGE_KEY_LENGTH};
	const HELLO_TIMEOUT_MS = ${helloTimeoutMs};
	const POLL_INTERVAL_MS = ${POLL_INTERVAL_MS};
	const CALL_TIMEOUT_MS = ${CALL_TIMEOUT_MS};
	const SCOPES = ["slot", "private", "shared"];
	const DOCUMENT = Math.random().toString(36).slice(2, 10);

	const pending = new Map();
	const watchers = new Map();
	let seq = 0;
	let settleReady = null;
	let socket = null;
	let available = false;
	let identity = null;
	let revoked = false;

	const ready = new Promise((resolve) => {
		settleReady = resolve;
	});

	const settle = (value) => {
		if (!settleReady) return;
		const done = settleReady;
		settleReady = null;
		done(value);
	};

	const fail = (code, message) => {
		const error = new Error(message);
		error.code = code;
		return error;
	};

	const post = (message) => {
		parent.postMessage({ channel: FRAME, ...message }, "*");
	};

	const settleAll = (code, message) => {
		for (const [, entry] of pending) entry.reject(fail(code, message));
		pending.clear();
	};

	const deliver = (data) => {
		if (data.type === "result") {
			const entry = pending.get(data.id);
			if (!entry) return;
			pending.delete(data.id);
			if (data.ok) entry.resolve(data.result);
			else entry.reject(fail(data.code, data.message));
			return;
		}
		if (data.type === "records") {
			const fns = watchers.get(watchKey(data.scope || "slot", data.key));
			if (fns) for (const fn of fns) fn.push(data.records);
			return;
		}
		if (data.type === "revoked") {
			revoked = true;
			settleAll("revoked", "Access to this page changed");
		}
	};

	const openSocket = (url) => {
		socket = new WebSocket(url);
		socket.addEventListener("message", (event) => {
			let data;
			try { data = JSON.parse(event.data); } catch { return; }
			if (data.type === "hello") {
				identity = {
					viewer: data.viewer,
					author: data.author,
					writable: data.writable,
					scopes: data.scopes === true,
				};
				available = true;
				settle(true);
				revive();
				return;
			}
			deliver(data);
		});
		socket.addEventListener("close", () => {
			socket = null;
			available = false;
			settle(false);
			if (!revoked) settleAll("unavailable", "The page's storage socket closed");
		});
		socket.addEventListener("error", () => {
			settle(false);
		});
	};

	if (parent === window) {
		settle(false);
	} else {
		const deadline = Date.now() + HELLO_TIMEOUT_MS;
		const knock = () => {
			if (!settleReady) return;
			if (Date.now() > deadline) { settle(false); return; }
			post({ type: "hello" });
			setTimeout(knock, 200);
		};
		knock();
	}

	addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== HOST) return;
		if (event.source !== parent) return;
		if (data.type === "connect") {
			if (!socket) openSocket(data.url);
			return;
		}
	});

	const revive = () => {
		for (const [, fns] of watchers) {
			for (const fn of fns) fn.refresh();
		}
	};

	const call = async (request) => {
		if (revoked) throw fail("revoked", "Access to this page changed");
		if (!available) {
			await ready;
			if (!available) {
				throw fail("unavailable", "Page storage is not available in this view");
			}
		}
		if (!(identity && identity.scopes)) {
			if (request.op === "list") {
				throw fail("unavailable", "This page's storage cannot list keys yet");
			}
			if (request.scope) {
				throw fail("unavailable", "This page's storage does not support the " + request.scope + " scope yet");
			}
		}
		const id = DOCUMENT + "." + ++seq;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			if (!socket || socket.readyState !== 1) {
				pending.delete(id);
				reject(fail("unavailable", "The page's storage socket is closed"));
				return;
			}
			socket.send(JSON.stringify({ type: "call", id, request }));
			setTimeout(() => {
				if (!pending.has(id)) return;
				pending.delete(id);
				reject(fail("unavailable", "Page storage did not answer"));
			}, CALL_TIMEOUT_MS);
		});
	};

	const checkKey = (key) => {
		if (typeof key !== "string" || !key.length || key.length > MAX_KEY_LENGTH) {
			throw fail("invalid", "A storage key is 1 to " + MAX_KEY_LENGTH + " characters");
		}
		return key;
	};

	const checkScope = (options) => {
		if (options != null && (typeof options !== "object" || Array.isArray(options))) {
			throw fail("invalid", "A storage scope is slot, private or shared");
		}
		const scope = options && options.scope !== undefined ? options.scope : "slot";
		if (!SCOPES.includes(scope)) {
			throw fail("invalid", "A storage scope is slot, private or shared");
		}
		return scope;
	};

	const withScope = (request, scope) =>
		scope === "slot" ? request : { ...request, scope };

	const watchKey = (scope, key) => scope + "\u0000" + key;

	const checkValue = (value) => {
		let encoded;
		try {
			encoded = JSON.stringify(value ?? null);
		} catch {
			throw fail("invalid", "A storage value must be JSON");
		}
		if (encoded === undefined) {
			throw fail("invalid", "A storage value must be JSON");
		}
		if (new TextEncoder().encode(encoded).length > MAX_VALUE_BYTES) {
			throw fail("quota_exceeded", "A storage value is at most " + MAX_VALUE_BYTES + " bytes");
		}
		return JSON.parse(encoded);
	};

	const storage = {
		ready,
		get viewer() { return identity ? identity.viewer : null; },
		get author() { return identity ? identity.author : false; },
		get writable() { return identity ? identity.writable : null; },
		async get(key, options) {
			const scope = checkScope(options);
			const result = await call(withScope({ op: "get", key: checkKey(key) }, scope));
			return result.value ?? null;
		},
		async getAll(key, options) {
			const scope = checkScope(options);
			const result = await call(withScope({ op: "getAll", key: checkKey(key) }, scope));
			return result.records || [];
		},
		async set(key, value, options) {
			const scope = checkScope(options);
			await call(withScope({ op: "set", key: checkKey(key), value: checkValue(value) }, scope));
		},
		async remove(key, options) {
			const scope = checkScope(options);
			await call(withScope({ op: "remove", key: checkKey(key) }, scope));
		},
		async list(prefix, options) {
			if (prefix !== undefined && (typeof prefix !== "string" || prefix.length > MAX_KEY_LENGTH)) {
				throw fail("invalid", "A storage key prefix is at most " + MAX_KEY_LENGTH + " characters");
			}
			const scope = checkScope(options);
			const result = await call(withScope(prefix ? { op: "list", prefix } : { op: "list" }, scope));
			return result.keys || [];
		},
		subscribe(key, onRecords, options) {
			checkKey(key);
			const scope = checkScope(options);
			const watched = watchKey(scope, key);
			let stopped = false;
			let timer = 0;
			let inFlight = false;
			let again = false;

			const read = async () => {
				if (stopped) return;
				if (inFlight) { again = true; return; }
				inFlight = true;
				try {
					const records = await storage.getAll(key, options);
					if (!stopped) onRecords(records);
				} catch (error) {
					console.warn("superset.storage: subscription to " + key + " failed", error);
				}
				inFlight = false;
				if (again && !stopped) { again = false; read(); }
			};

			const entry = {
				refresh: read,
				push: (records) => { if (!stopped) onRecords(records); },
			};
			const fns = watchers.get(watched) || new Set();
			fns.add(entry);
			watchers.set(watched, fns);

			const tick = () => {
				read();
				if (!stopped && !available) {
					timer = setTimeout(tick, POLL_INTERVAL_MS);
				}
			};
			const onFocus = () => {
				if (document.visibilityState === "visible") read();
			};

			tick();
			addEventListener("visibilitychange", onFocus);
			addEventListener("focus", onFocus);
			return () => {
				stopped = true;
				if (timer) clearTimeout(timer);
				fns.delete(entry);
				if (!fns.size) watchers.delete(watched);
				removeEventListener("visibilitychange", onFocus);
				removeEventListener("focus", onFocus);
			};
		},
	};

	window.superset = window.superset || {};
	window.superset.storage = storage;
})();`;
}

export const PAGE_STORAGE_RUNTIME_SOURCE = pageStorageRuntimeSource();
