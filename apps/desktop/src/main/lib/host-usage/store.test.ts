import { expect, test } from "bun:test";
import type { UsageAccount } from "shared/host-usage-observation";
import { createHostUsageStore } from "./store";

const host = "http://127.0.0.1:1234";
function quota(accountKey: string): UsageAccount[] {
	return [
		{
			agent: "claude",
			credentialKind: "subscription",
			accountKey,
			sourceLabel: accountKey,
			email: null,
			plan: null,
			status: "ok",
			statusDetail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: null,
			isDefault: false,
			fetchedAt: new Date(0),
		},
	];
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("two windows coalesce their normal and forced reads and receive the same observation", async () => {
	const pending = deferred<UsageAccount[]>();
	let calls = 0;
	const store = createHostUsageStore(() => ({
		key: "identity-a",
		load: async () => {
			calls++;
			return pending.promise;
		},
	}));
	const left: unknown[] = [];
	const right: unknown[] = [];
	const closeLeft = store.subscribe((value) => left.push(value));
	store.subscribe((value) => right.push(value));
	const first = store.read(host, true);
	const second = store.read(host, true);
	pending.resolve(quota("a"));
	const [a, b] = await Promise.all([first, second]);
	expect(calls).toBe(1);
	expect(a).toBe(b);
	expect(left).toEqual(right);
	closeLeft();
	await store.read(host);
	expect(right.length).toBeGreaterThan(left.length);
});

test("a forced refresh queued behind a normal read runs once for all windows", async () => {
	const older = deferred<UsageAccount[]>();
	let calls = 0;
	const store = createHostUsageStore(() => ({
		key: "identity-a",
		load: async (force) => {
			calls++;
			return force ? quota("new") : older.promise;
		},
	}));
	const normal = store.read(host);
	const first = store.read(host, true);
	const second = store.read(host, true);
	older.resolve(quota("old"));
	await normal;
	const [a, b] = await Promise.all([first, second]);
	expect(calls).toBe(2);
	expect(a?.data?.[0]?.accountKey).toBe("new");
	expect(b).toBe(a);
});

test("an old host identity cannot publish over its replacement", async () => {
	const older = deferred<UsageAccount[]>();
	let key = "identity-a";
	const store = createHostUsageStore(() => ({
		key,
		load: () =>
			key === "identity-a" ? older.promise : Promise.resolve(quota("new")),
	}));
	const first = store.read(host);
	await Promise.resolve();
	key = "identity-b";
	const next = await store.read(host);
	older.resolve(quota("old"));
	const stale = await first;
	expect(next?.data?.[0]?.accountKey).toBe("new");
	expect(stale?.data).toEqual(next?.data);
	expect(store.peek(host)?.data).toEqual(next?.data);
});

test("a transport failure retains the reading but publishes its unavailable state", async () => {
	let fail = false;
	const store = createHostUsageStore(() => ({
		key: "a",
		load: async () => {
			if (fail) throw new Error("offline");
			return quota("a");
		},
	}));
	await store.read(host);
	fail = true;
	const result = await store.read(host, true);
	expect(result?.data?.[0]?.accountKey).toBe("a");
	expect(result?.offline).toBe(true);
	expect(result?.loading).toBe(false);
});

test("sign-out clears every subscriber and blocks a pending old response", async () => {
	const older = deferred<UsageAccount[]>();
	let available = true;
	const store = createHostUsageStore(() =>
		available ? { key: "a", load: () => older.promise } : null,
	);
	const events: unknown[] = [];
	store.subscribe((value) => events.push(value));
	const pending = store.read(host);
	await Promise.resolve();
	available = false;
	store.clear();
	older.resolve(quota("old"));
	const result = await pending;
	expect(store.peek(host)).toBeNull();
	expect(result?.data).toBeNull();
	expect(result?.offline).toBe(true);
	expect(events.at(-1)).toMatchObject({ data: null, offline: true });
});

test("subscriber failure and refresh throttling do not lose healthy readings", async () => {
	let now = 0;
	const forced: boolean[] = [];
	const store = createHostUsageStore(
		() => ({
			key: "a",
			load: async (force) => {
				forced.push(force);
				return quota("a");
			},
		}),
		() => now,
	);
	store.subscribe(() => {
		throw new Error("closed window");
	});
	await store.read(host, true);
	now = 1;
	await store.read(host, true);
	now = 30000;
	await store.read(host, true);
	expect(forced).toEqual([true, false, true]);
	expect(store.peek(host)?.offline).toBe(false);
});

test("reconnecting before an old flight settles starts a fresh read", async () => {
	const older = deferred<UsageAccount[]>();
	let available = true;
	let calls = 0;
	const store = createHostUsageStore(() =>
		available
			? {
					key: "same-runtime",
					load: async () =>
						++calls === 1 ? older.promise : quota("reconnected"),
				}
			: null,
	);
	const first = store.read(host);
	await Promise.resolve();
	available = false;
	expect(store.peek(host)?.offline).toBe(true);
	available = true;
	const next = store.read(host);
	await Promise.resolve();
	older.resolve(quota("disconnected"));
	const [stale, current] = await Promise.all([first, next]);
	expect(calls).toBe(2);
	expect(current?.data?.[0]?.accountKey).toBe("reconnected");
	expect(stale?.data).toEqual(current?.data);
	expect(store.peek(host)?.data).toEqual(current?.data);
});

test("a subscriber reading a loading observation joins the registered flight", async () => {
	const pending = deferred<UsageAccount[]>();
	let calls = 0;
	let subscribed = false;
	let nested:
		| ReturnType<ReturnType<typeof createHostUsageStore>["read"]>
		| undefined;
	const store = createHostUsageStore(() => ({
		key: "a",
		load: async () => {
			calls++;
			return pending.promise;
		},
	}));
	store.subscribe((observation) => {
		if (!observation.loading || subscribed) return;
		subscribed = true;
		nested = store.read(host);
	});
	const first = store.read(host);
	pending.resolve(quota("a"));
	const [a, b] = await Promise.all([first, nested]);
	expect(calls).toBe(1);
	expect(b).toBe(a);
});

test("same-machine runtime replacement retains only the manual refresh guard", async () => {
	let now = 0;
	let key = "runtime-a";
	let scope = "org:machine-a";
	const forced: boolean[] = [];
	const store = createHostUsageStore(
		() => ({
			key,
			scope,
			load: async (force) => {
				forced.push(force);
				return quota(key);
			},
		}),
		() => now,
	);
	await store.read(host, true);
	key = "runtime-b";
	now = 1;
	expect(store.peek(host)?.data).toBeNull();
	await store.read(host, true);
	scope = "org:machine-b";
	now = 2;
	expect(store.peek(host)?.data).toBeNull();
	await store.read(host, true);
	expect(forced).toEqual([true, false, true]);
});

test("a new authoritative port retires the old URL without resetting its refresh guard", async () => {
	let url = host;
	const forced: boolean[] = [];
	const store = createHostUsageStore((requested) =>
		requested === url
			? {
					key: url,
					scope: "org:machine",
					load: async (force) => {
						forced.push(force);
						return quota(url);
					},
				}
			: null,
	);
	await store.read(url, true);
	url = "http://127.0.0.1:5678";
	expect(store.peek(url)?.data).toBeNull();
	expect(store.peek(host)).toBeNull();
	await store.read(url, true);
	expect(forced).toEqual([true, false]);
});

test("the main observation inventory stays bounded", async () => {
	const store = createHostUsageStore((url) => ({
		key: url,
		load: async () => quota(url),
	}));
	for (let i = 0; i < 129; i++) await store.read(`host-${i}`);
	expect(store.peek("host-128")?.data?.[0]?.accountKey).toBe("host-128");
	expect(store.peek("host-0")?.data).toBeNull();
});

test("source invalidation discards pending data and queued refreshes but keeps the same-scope guard", async () => {
	const pending = deferred<UsageAccount[]>();
	const forces: boolean[] = [];
	let now = 0;
	const store = createHostUsageStore(
		() => ({
			key: "a",
			scope: "org:machine",
			load: async (force) => {
				forces.push(force);
				return forces.length === 2 ? pending.promise : quota("accepted");
			},
		}),
		() => now,
	);
	await store.read(host, true);
	const normal = store.read(host);
	await Promise.resolve();
	now = 30_000;
	const queued = store.read(host, true);
	store.invalidate(host);
	expect(store.peek(host)).toMatchObject({
		data: null,
		offline: true,
		invalidated: true,
	});
	pending.resolve(quota("discarded"));
	expect((await normal)?.data).toBeNull();
	expect((await queued)?.data).toBeNull();
	expect(forces).toEqual([true, false]);
	await store.read(host, true);
	expect(forces).toEqual([true, false, true]);
	store.invalidate(host);
	await store.read(host, true);
	expect(forces).toEqual([true, false, true, false]);
});

test("a source revoked before admission never starts the request", async () => {
	let available = true;
	let calls = 0;
	const store = createHostUsageStore(() =>
		available
			? {
					key: "a",
					load: async () => {
						calls++;
						return quota("revoked");
					},
				}
			: null,
	);
	const pending = store.read(host);
	available = false;
	expect((await pending)?.offline).toBe(true);
	expect(calls).toBe(0);
});

test("an ordinary settled read still checks the host without a desktop freshness cache", async () => {
	let calls = 0;
	const store = createHostUsageStore(() => ({
		key: "a",
		load: async () => quota(`reading-${++calls}`),
	}));
	await store.read(host);
	expect((await store.read(host))?.data?.[0]?.accountKey).toBe("reading-2");
	expect(calls).toBe(2);
});

test("a native update during a pending read publishes one trailing reading to both displays", async () => {
	const older = deferred<UsageAccount[]>();
	let calls = 0;
	const store = createHostUsageStore(() => ({
		key: "identity-a",
		load: async (force) => {
			expect(force).toBe(false);
			return ++calls === 1 ? older.promise : quota("native");
		},
	}));
	const left: string[] = [],
		right: string[] = [];
	store.subscribe((value) => {
		if (!value.loading && value.data)
			left.push(value.data[0]?.accountKey ?? "");
	});
	store.subscribe((value) => {
		if (!value.loading && value.data)
			right.push(value.data[0]?.accountKey ?? "");
	});
	const pending = store.read(host);
	await Promise.resolve();
	const first = store.readAfterPending(host);
	const coalesced = store.readAfterPending(host);
	older.resolve(quota("older"));
	await Promise.all([pending, first, coalesced]);
	expect(calls).toBe(2);
	expect(left).toEqual(["older", "native"]);
	expect(right).toEqual(left);
});

test("a retired source waiting on its old read does not load the replacement", async () => {
	const older = deferred<UsageAccount[]>();
	let key = "old",
		replacementLoads = 0;
	const store = createHostUsageStore(() => ({
		key,
		load: async () => {
			if (key === "old") return older.promise;
			replacementLoads++;
			return quota("new");
		},
	}));
	const pending = store.read(host);
	await Promise.resolve();
	const trailing = store.readAfterPending(host);
	key = "new";
	store.invalidate(host);
	older.resolve(quota("old"));
	await Promise.all([pending, trailing]);
	expect(replacementLoads).toBe(0);
	expect(store.peek(host)?.data).toBeNull();
});
