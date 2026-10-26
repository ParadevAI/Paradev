import { expect, test } from "bun:test";
import type { RelaySocketOptions } from "@superset/workspace-client/relay-socket";
import { createNativeUsageUpdates } from "./native-updates";
import { createHostUsageStore } from "./store";

class FixtureSocket {
	closed = false;
	listeners = new Map<string, Set<(event: unknown) => void>>();
	addEventListener(type: string, listener: (event: unknown) => void) {
		const entries = this.listeners.get(type) ?? new Set();
		entries.add(listener);
		this.listeners.set(type, entries);
	}
	removeEventListener(type: string, listener: (event: unknown) => void) {
		this.listeners.get(type)?.delete(listener);
	}
	emit(type: string, event: unknown = {}) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
	close() {
		this.closed = true;
	}
}
function fixture() {
	let timerId = 0;
	let work: () => Promise<unknown> = async () => undefined;
	const tasks = new Map<number, () => void>();
	const sockets: FixtureSocket[] = [];
	const options: RelaySocketOptions[] = [];
	const reads: string[] = [];
	const observer = createNativeUsageUpdates({
		createSocket: (config) => {
			options.push(config);
			const socket = new FixtureSocket();
			sockets.push(socket);
			return socket;
		},
		schedule: (run, delay) => {
			expect(delay).toBe(200);
			const id = ++timerId;
			tasks.set(id, run);
			return id;
		},
		cancel: (id) => {
			tasks.delete(id as number);
		},
		read: async (url) => {
			reads.push(url);
			return work();
		},
	});
	const source = {
		hostUrl: "http://127.0.0.1:43210",
		key: "connection-one",
		getToken: () => "fixture-local-auth",
	};
	const update = (socket = sockets.at(-1)) =>
		socket?.emit("message", {
			data: JSON.stringify({
				type: "usage:changed",
				provider: "claude",
				occurredAt: 1,
			}),
		});
	return {
		observer,
		sockets,
		options,
		reads,
		tasks,
		source,
		update,
		setWork: (next: typeof work) => {
			work = next;
		},
		flush: async () => {
			const pending = [...tasks.values()];
			tasks.clear();
			for (const run of pending) run();
			await new Promise<void>((resolve) => queueMicrotask(resolve));
		},
	};
}

test("one authenticated loopback observer coalesces native changes and reads again after reconnect", async () => {
	const f = fixture();
	expect(f.observer.observe(f.source)).toBe(true);
	expect(f.observer.observe(f.source)).toBe(true);
	expect(f.sockets).toHaveLength(1);
	expect(await f.options[0]?.buildUrl()).toBe(`${f.source.hostUrl}/events`);
	expect(await f.options[0]?.getToken()).toBe("fixture-local-auth");
	expect(f.options[0]?.maxEnqueuedMessages).toBe(0);
	f.sockets[0]?.emit("open");
	f.update();
	f.update();
	expect(f.tasks.size).toBe(1);
	await f.flush();
	expect(f.reads).toEqual([f.source.hostUrl]);
	expect(f.tasks.size).toBe(0);
	f.sockets[0]?.emit("open");
	await f.flush();
	expect(f.reads).toHaveLength(2);
	f.observer.clear();
});

test("events during an in-flight snapshot cause one trailing shared read", async () => {
	const f = fixture();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.setWork(() => gate);
	f.observer.observe(f.source);
	f.update();
	await f.flush();
	expect(f.reads).toHaveLength(1);
	f.update();
	f.update();
	expect(f.tasks.size).toBe(0);
	f.setWork(async () => undefined);
	release();
	await new Promise<void>((resolve) => queueMicrotask(resolve));
	expect(f.tasks.size).toBe(1);
	await f.flush();
	expect(f.reads).toHaveLength(2);
	expect(f.tasks.size).toBe(0);
	f.observer.clear();
});

test("replaced connection keys reject stale socket callbacks and revoke old authentication", async () => {
	const f = fixture();
	f.observer.observe(f.source);
	const old = f.sockets[0];
	const stale = [...(old?.listeners.get("message") ?? [])][0];
	f.update();
	f.observer.observe({ ...f.source, key: "connection-two" });
	expect(old?.closed).toBe(true);
	expect(await f.options[0]?.getToken()).toBeNull();
	stale?.({
		data: JSON.stringify({
			type: "usage:changed",
			provider: "claude",
			occurredAt: 1,
		}),
	});
	expect(f.tasks.size).toBe(0);
	f.update();
	await f.flush();
	expect(f.reads).toHaveLength(1);
	f.observer.clear();
	expect(f.sockets[1]?.closed).toBe(true);
	expect(await f.options[1]?.getToken()).toBeNull();
});

test("logout and stop cancel queued work and cannot requeue a read that completes later", async () => {
	const f = fixture();
	let release!: () => void;
	f.setWork(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	f.observer.observe(f.source);
	f.update();
	await f.flush();
	f.update();
	f.observer.clear();
	release();
	await new Promise<void>((resolve) => queueMicrotask(resolve));
	expect(f.tasks.size).toBe(0);
	expect(f.reads).toHaveLength(1);
	expect(f.sockets[0]?.closed).toBe(true);
	f.observer.observe(f.source);
	f.update();
	f.observer.close(f.source.hostUrl);
	await f.flush();
	expect(f.reads).toHaveLength(1);
});

test("foreign endpoints and malformed or oversized messages do not trigger snapshots", async () => {
	const f = fixture();
	for (const hostUrl of [
		"https://public.example.test",
		"http://127.0.0.1/private",
		"http://user@127.0.0.1",
		"http://127.0.0.1?token=untrusted",
	])
		expect(f.observer.observe({ ...f.source, hostUrl })).toBe(false);
	expect(f.sockets).toHaveLength(0);
	f.observer.observe(f.source);
	for (const data of [
		"bad-json",
		" ".repeat(1025),
		JSON.stringify({ type: "usage:changed", provider: "codex", occurredAt: 1 }),
		JSON.stringify({
			type: "agent:lifecycle",
			provider: "claude",
			occurredAt: 1,
		}),
		JSON.stringify({
			type: "usage:changed",
			provider: "claude",
			occurredAt: -1,
		}),
		JSON.stringify({ type: "usage:changed", provider: "claude" }),
		{ type: "usage:changed", provider: "claude", occurredAt: 1 },
	])
		f.sockets[0]?.emit("message", { data });
	await f.flush();
	expect(f.reads).toHaveLength(0);
	f.observer.clear();
});

test("a failed shared read does not start a retry loop", async () => {
	const f = fixture();
	f.setWork(async () => {
		throw new Error("fixture-offline");
	});
	f.observer.observe(f.source);
	f.update();
	await f.flush();
	expect(f.reads).toHaveLength(1);
	expect(f.tasks.size).toBe(0);
	f.observer.clear();
});

test("a native event publishes the same unforced snapshot to dashboard and floating subscribers", async () => {
	const f = fixture();
	const forced: boolean[] = [];
	const store = createHostUsageStore(() => ({
		key: "verified-host",
		load: async (force) => {
			forced.push(force);
			return [];
		},
	}));
	let dashboardVersion = -1;
	let floatingVersion = -2;
	store.subscribe((value) => {
		dashboardVersion = value.version;
	});
	store.subscribe((value) => {
		floatingVersion = value.version;
	});
	f.setWork(() => store.readAfterPending(f.source.hostUrl));
	f.observer.observe(f.source);
	f.update();
	await f.flush();
	expect(f.reads).toHaveLength(1);
	await store.read(f.source.hostUrl, false);
	expect(dashboardVersion).toBeGreaterThan(0);
	expect(dashboardVersion).toBe(floatingVersion);
	expect(forced.every((value) => value === false)).toBe(true);
	f.observer.clear();
});

test("revoked authentication cancels queued events even before a connection replacement notification", async () => {
	const f = fixture();
	let token: string | null = "current";
	f.observer.observe({ ...f.source, getToken: () => token });
	f.update();
	expect(f.tasks.size).toBe(1);
	token = null;
	await f.flush();
	expect(f.reads).toHaveLength(0);
	expect(f.sockets[0]?.closed).toBe(true);
	f.observer.clear();
});
