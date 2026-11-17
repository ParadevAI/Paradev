import { describe, expect, test } from "bun:test";
import type { ChatState } from "@superset/chats-core";
import type {
	Bootstrap,
	RealtimeEvent,
	SyncSignal,
} from "../api-types/api-types.ts";
import { ApiError } from "../http/http.ts";
import type { SocketFactory } from "../realtime/realtime.ts";
import type { SyncStatus } from "../sync-status/sync-status.ts";
import { apiMessage, bootstrap } from "../test-fixtures/test-fixtures.ts";
import { startSync } from "./sync-session.ts";

const CHANNEL = "group:g-me";
const jwt = `h.${btoa(JSON.stringify({ exp: 4_000_000_000 })).replace(/=+$/, "")}.s`;

/** One fake channel socket the test pushes frames into. */
function fakeSocket() {
	const listeners = new Map<string, ((event: unknown) => void)[]>();
	const factory: SocketFactory = () => ({
		readyState: 1,
		send: () => {},
		close: () => {},
		addEventListener: (type: string, listener: (event: unknown) => void) =>
			listeners.set(type, [...(listeners.get(type) ?? []), listener]),
	});
	const fire = (frame: unknown) => {
		for (const l of listeners.get("message") ?? [])
			l({ data: JSON.stringify(frame) });
	};
	return { factory, fire };
}

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (err: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(bootstraps: Promise<Bootstrap>[]) {
	const socket = fakeSocket();
	const snapshots: ChatState[] = [];
	const events: RealtimeEvent[] = [];
	const signals: SyncSignal["type"][] = [];
	// Each shown status with how many snapshots had landed by then.
	const statuses: [SyncStatus, number][] = [];
	let unauthorized = 0;
	let loadErrors = 0;
	let tokens = 0;
	const session = startSync({
		api: {
			bootstrap: () => bootstraps.shift()!,
			realtimeToken: async () => {
				tokens++;
				return { token: jwt, channels: [CHANNEL] };
			},
		},
		realtimeUrl: "ws://rt.test/realtime",
		onSnapshot: (fresh) => snapshots.push(fresh),
		onLoadError: () => loadErrors++,
		onEvent: (event) => events.push(event),
		signal: (s) => signals.push(s.type),
		onConnection: () => {},
		onStatus: (status) => statuses.push([status, snapshots.length]),
		statusDelayMs: 5,
		retryDelaysMs: [10],
		onUnauthorized: () => unauthorized++,
		socket: socket.factory,
	});
	return {
		session,
		socket,
		snapshots,
		events,
		signals,
		statuses,
		counts: () => ({ unauthorized, loadErrors }),
		tokens: () => tokens,
	};
}

describe("startSync", () => {
	test("an event heard while the bootstrap is in flight is replayed on top of its snapshot", async () => {
		const first = deferred<Bootstrap>();
		const { session, socket, snapshots, events, signals } = setup([
			first.promise,
		]);
		await settle();
		socket.fire({ type: "hello", channel: CHANNEL, seq: 1, resumed: true });
		const late = {
			type: "message.created",
			message: apiMessage({ id: "m-late", at: "2026-10-10T10:00:00.000Z" }),
			task: null,
		} as RealtimeEvent;
		socket.fire({ type: "event", channel: CHANNEL, seq: 2, data: late });
		expect(events).toEqual([late]);
		first.resolve(bootstrap());
		await settle();
		expect(snapshots[0]!.messages.map((m) => m.id)).toContain("m-late");
		expect(signals).toEqual(["event", "bootstrapped"]);
		session.stop();
	});

	test("group.deleted is applied without a re-bootstrap, and a fresh token closes the group's channel", async () => {
		const { session, socket, snapshots, events, tokens } = setup([
			Promise.resolve(bootstrap()),
		]);
		await settle();
		socket.fire({ type: "hello", channel: CHANNEL, seq: 1, resumed: true });
		const before = tokens();
		const deleted = {
			type: "group.deleted",
			groupId: "g-trip",
			title: "Trip",
			deletedBy: "u2",
		} as RealtimeEvent;
		socket.fire({ type: "event", channel: CHANNEL, seq: 2, data: deleted });
		await settle();
		expect(events).toEqual([deleted]);
		expect(snapshots).toHaveLength(1);
		expect(tokens()).toBe(before + 1);
		session.stop();
	});

	test("groupsChanged, after joining or creating a chat, gets a fresh token and re-bootstraps without waiting on realtime", async () => {
		const { session, snapshots, tokens } = setup([
			Promise.resolve(bootstrap()),
			Promise.resolve(bootstrap()),
		]);
		await settle();
		const before = tokens();
		session.groupsChanged();
		await settle();
		expect(snapshots).toHaveLength(2);
		expect(tokens()).toBe(before + 1);
		session.stop();
	});

	test("only the most recently started bootstrap lands", async () => {
		const slow = deferred<Bootstrap>();
		const { session, snapshots } = setup([
			slow.promise,
			Promise.resolve(bootstrap({ messages: [] })),
		]);
		await session.refresh();
		slow.resolve(bootstrap());
		await settle();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]!.messages).toEqual([]);
		session.stop();
	});

	test("the status reads updating until the bootstrap's snapshot is applied, then live", async () => {
		const first = deferred<Bootstrap>();
		const { session, socket, statuses } = setup([first.promise]);
		await settle();
		socket.fire({ type: "hello", channel: CHANNEL, seq: 1, resumed: true });
		await Bun.sleep(20);
		expect(statuses).toEqual([["updating", 0]]);
		first.resolve(bootstrap());
		await settle();
		expect(statuses).toEqual([
			["updating", 0],
			["live", 1],
		]);
		session.stop();
	});

	test("a quick launch never leaves live", async () => {
		const { session, socket, statuses } = setup([Promise.resolve(bootstrap())]);
		await settle();
		socket.fire({ type: "hello", channel: CHANNEL, seq: 1, resumed: true });
		await Bun.sleep(20);
		expect(statuses).toEqual([]);
		session.stop();
	});

	test("a 401 signs out; other failures are load errors", async () => {
		const a = setup([Promise.reject(new ApiError(401, "unauthorized", "no"))]);
		await settle();
		expect(a.counts()).toEqual({ unauthorized: 1, loadErrors: 0 });
		a.session.stop();
		const b = setup([Promise.reject(new TypeError("offline"))]);
		await settle();
		expect(b.counts()).toEqual({ unauthorized: 0, loadErrors: 1 });
		b.session.stop();
		// Stopped, it isn't tried again.
		await Bun.sleep(30);
		expect(b.counts()).toEqual({ unauthorized: 0, loadErrors: 1 });
	});

	test("a refresh asked for while a retry waits takes its place; one success ends the retries", async () => {
		const failed = Promise.reject(new TypeError("offline"));
		failed.catch(() => {});
		const { session, snapshots, counts } = setup([
			failed,
			Promise.resolve(bootstrap()),
		]);
		await settle();
		expect(counts().loadErrors).toBe(1);
		await session.refresh();
		expect(snapshots.length).toBe(1);
		// The retry that was waiting would have asked again, finding no bootstrap left and failing.
		await Bun.sleep(30);
		expect(counts().loadErrors).toBe(1);
		expect(snapshots.length).toBe(1);
		session.stop();
	});

	test("a failed bootstrap keeps reading updating and is tried again until one lands", async () => {
		// Handled now, so the one not yet asked for isn't an unhandled rejection.
		const offline = () => {
			const failed = Promise.reject(new TypeError("offline"));
			failed.catch(() => {});
			return failed;
		};
		const { session, socket, snapshots, statuses, counts } = setup([
			offline(),
			offline(),
			Promise.resolve(bootstrap()),
		]);
		await settle();
		socket.fire({ type: "hello", channel: CHANNEL, seq: 1, resumed: true });
		await Bun.sleep(15);
		expect(statuses).toEqual([["updating", 0]]);
		await Bun.sleep(40);
		expect(counts().loadErrors).toBe(2);
		expect(snapshots.length).toBe(1);
		expect(statuses).toEqual([
			["updating", 0],
			["live", 1],
		]);
		session.stop();
	});
});
