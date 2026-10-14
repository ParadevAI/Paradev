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
