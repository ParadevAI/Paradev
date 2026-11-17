import { describe, expect, test } from "bun:test";
import type { RealtimeEvent } from "../api-types/api-types.ts";
import { ApiError, isSlowDown } from "../http/http.ts";
import {
	type ConnectionState,
	connectRealtime,
	readFrame,
	type SocketFactory,
	tokenExpiry,
} from "./realtime.ts";

const G1 = "group:00000000-0000-4000-8000-000000000001";
const G2 = "group:00000000-0000-4000-8000-000000000002";
const ME = "user:00000000-0000-4000-8000-0000000000aa";
const event = (n: number) =>
	({ type: "groups.changed", n }) as unknown as RealtimeEvent;

/** A JWT-shaped token whose payload says when it expires (the client only reads `exp`). */
const jwt = (exp: number, id = "t") =>
	`h.${btoa(JSON.stringify({ exp, id })).replace(/=+$/, "")}.${id}`;

describe("pure parts", () => {
	test("a token's expiry is read from its payload; garbage counts as expired", () => {
		expect(tokenExpiry(jwt(1234))).toBe(1234);
		expect(tokenExpiry("nope")).toBe(0);
	});

	test("frames: repeats are dropped, a resumed hello keeps the cursor, a fresh or gapped one asks for a resync", () => {
		expect(
			readFrame(null, { type: "hello", channel: G1, seq: 7, resumed: false }),
		).toEqual({ lastSeq: 7, resync: true });
		expect(
			readFrame(5, { type: "hello", channel: G1, seq: 7, resumed: true }),
		).toEqual({ lastSeq: 5 });
		expect(
			readFrame(5, { type: "event", channel: G1, seq: 6, data: event(6) }),
		).toEqual({ lastSeq: 6, event: event(6) });
		expect(
			readFrame(6, { type: "event", channel: G1, seq: 6, data: event(6) }),
		).toEqual({ lastSeq: 6 });
	});

	test("an ephemeral event is passed on without moving the channel's seq", () => {
		const typing: RealtimeEvent = {
			type: "typing",
			groupId: "g",
			userId: "u",
			typing: true,
		};
		expect(
			readFrame(6, {
				type: "event",
				channel: G1,
				seq: 6,
				data: typing,
				ephemeral: true,
			}),
		).toEqual({ lastSeq: 6, event: typing });
	});
});

/** The realtime Worker in memory: one fake socket per connection, which a test drives from the server's side. */
function fakeWorker() {
	const sockets: FakeSocket[] = [];
	class FakeSocket {
		readyState = 0;
		sent: string[] = [];
		private readonly listeners = new Map<
			string,
			((event: unknown) => void)[]
		>();
		constructor(
			readonly url: string,
			readonly protocols: string[],
		) {
			sockets.push(this);
		}
		get channel() {
			return decodeURIComponent(new URL(this.url).pathname.split("/").at(-1)!);
		}
		get since() {
			return new URL(this.url).searchParams.get("since");
		}
		addEventListener(type: string, listener: (event: unknown) => void) {
			this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
		}
		send(data: string) {
			this.sent.push(data);
		}
		/** Like a browser's: closing from the client's side only reports `close` once the server answers. */
		close() {
			if (this.readyState < 2) this.readyState = 2;
		}
		hello(seq: number, resumed: boolean) {
			this.readyState = 1;
			this.fire("message", {
				data: JSON.stringify({
					type: "hello",
					channel: this.channel,
					seq,
					resumed,
				}),
			});
		}
		push(seq: number) {
			this.fire("message", {
				data: JSON.stringify({
					type: "event",
					channel: this.channel,
					seq,
					data: event(seq),
				}),
			});
		}
		pong() {
			this.fire("message", { data: "pong" });
		}
		drop(code = 1006) {
			if (this.readyState === 3) return;
			this.readyState = 3;
			this.fire("close", { code });
		}
		private fire(type: string, payload: unknown) {
			for (const listener of this.listeners.get(type) ?? []) listener(payload);
		}
	}
	const latest = (channel: string) =>
		[...sockets].reverse().find((s) => s.channel === channel)!;
	return {
		sockets,
		latest,
		factory: ((url, protocols) =>
			new FakeSocket(url, protocols)) as SocketFactory,
	};
}

const until = async (check: () => boolean) => {
	for (let i = 0; i < 400 && !check(); i++) await Bun.sleep(2);
	expect(check()).toBe(true);
};

function setup(
	opts: {
		channels?: string[];
		getToken?: () => Promise<{ token: string; channels: string[] }>;
		retryMs?: (attempt: number, err?: unknown) => number;
		now?: () => number;
		pingMs?: number;
		silentMs?: number;
	} = {},
) {
	const worker = fakeWorker();
	const seen: RealtimeEvent[] = [];
	const states: ConnectionState[] = [];
	const checking: boolean[] = [];
	let resyncs = 0;
	let unauthorized = 0;
	let tokens = 0;
	const grant = { channels: opts.channels ?? [ME, G1] };
	const client = connectRealtime({
		url: "ws://worker.test/realtime/",
		getToken:
			opts.getToken ??
			(async () => {
				tokens++;
				return {
					token: jwt(Math.floor(Date.now() / 1000) + 600, `t${tokens}`),
					channels: grant.channels,
				};
			}),
		onEvent: (e) => void seen.push(e),
		onState: (s) => void states.push(s),
		onChecking: (c) => void checking.push(c),
		onResync: () => void resyncs++,
		onUnauthorized: () => void unauthorized++,
		socket: worker.factory,
		timing: {
			retryMs: opts.retryMs ?? (() => 5),
			pingMs: opts.pingMs ?? 10,
			silentMs: opts.silentMs ?? 40,
			resyncWaitMs: 30,
			probeMs: 20,
		},
		now: opts.now,
	});
	return {
		worker,
		client,
		seen,
		states,
		checking,
		grant,
		counts: () => ({ resyncs, unauthorized, tokens }),
	};
}

describe("the realtime client", () => {
	test("opens one socket per channel with the token as subprotocol, and resyncs once when all are open", async () => {
		const { worker, client, states, counts } = setup();
		await until(() => worker.sockets.length === 2);
		expect(worker.sockets.map((s) => s.url)).toEqual([
			`ws://worker.test/realtime/${encodeURIComponent(ME)}`,
			`ws://worker.test/realtime/${encodeURIComponent(G1)}`,
		]);
		for (const socket of worker.sockets) {
			expect(socket.protocols[0]).toBe("chats-realtime");
			expect(socket.protocols[1]).toEndWith(".t1");
		}
		worker.latest(ME).hello(3, false);
		expect(states.at(-1)).toBe("connecting");
		worker.latest(G1).hello(9, false);
		expect(states.at(-1)).toBe("connected");
		expect(counts().resyncs).toBe(1);
		client.disconnect();
	});

	test("after a drop a channel resumes from its last seq: missed events replay, repeats are dropped, no resync", async () => {
		const { worker, client, seen, states, counts } = setup({ channels: [G1] });
		await until(() => worker.sockets.length === 1);
		worker.latest(G1).hello(4, false);
		worker.latest(G1).push(5);
		worker.latest(G1).drop();
		expect(states.at(-1)).toBe("reconnecting");
		await until(() => worker.sockets.length === 2);
		expect(worker.latest(G1).since).toBe("5");
		worker.latest(G1).hello(7, true);
		worker.latest(G1).push(5);
		worker.latest(G1).push(6);
		worker.latest(G1).push(7);
		expect(seen).toEqual([event(5), event(6), event(7)]);
		expect(states.at(-1)).toBe("connected");
		expect(counts().resyncs).toBe(1);
		client.disconnect();
	});

	test("a gap older than the channel keeps asks for a resync", async () => {
		const { worker, client, counts } = setup({ channels: [G1] });
		await until(() => worker.sockets.length === 1);
		worker.latest(G1).hello(4, false);
		worker.latest(G1).drop();
		await until(() => worker.sockets.length === 2);
		worker.latest(G1).hello(400, false);
		expect(counts().resyncs).toBe(2);
		client.disconnect();
	});

	test("an expired token (4001) or a refused upgrade is replaced with a fresh one before reconnecting", async () => {
		const { worker, client, counts } = setup({ channels: [G1] });
		await until(() => worker.sockets.length === 1);
		worker.latest(G1).hello(1, false);
		worker.latest(G1).drop(4001);
		await until(() => worker.sockets.length === 2);
		expect(counts().tokens).toBe(2);
		expect(worker.latest(G1).protocols[1]).toEndWith(".t2");
		// Refused before any hello (e.g. 401): also a new token.
		worker.latest(G1).drop();
		await until(() => worker.sockets.length === 3);
		expect(counts().tokens).toBe(3);
		// A plain drop of an open socket keeps the token.
		worker.latest(G1).hello(1, true);
		worker.latest(G1).drop();
		await until(() => worker.sockets.length === 4);
		expect(counts().tokens).toBe(3);
		client.disconnect();
	});

	test("refresh after the user's groups change opens the new channels and closes the ones they left", async () => {
		const { worker, client, grant, counts } = setup({ channels: [ME, G1] });
		await until(() => worker.sockets.length === 2);
		worker.latest(ME).hello(1, false);
		worker.latest(G1).hello(1, false);
		grant.channels = [ME, G2];
		client.refresh();
		await until(() => worker.sockets.length === 3);
		expect(worker.latest(G2).since).toBeNull();
		expect(worker.latest(G1).readyState).toBe(2);
		worker.latest(G2).hello(0, false);
		expect(counts().resyncs).toBe(2);
		client.disconnect();
	});

	test("a refresh doesn't settle for a token that was already on its way before the groups changed", async () => {
		let release!: () => void;
		let calls = 0;
		const grant = { channels: [ME, G1] };
		const { worker, client } = setup({
			getToken: async () => {
				calls++;
				const channels = [...grant.channels];
				// The first fetch is slow: it was asked for before the group change and answers with the old channels.
				if (calls === 1) await new Promise<void>((r) => (release = r));
				return {
					token: jwt(Math.floor(Date.now() / 1000) + 600, `t${calls}`),
					channels,
				};
			},
		});
		await until(() => calls === 1);
		grant.channels = [ME, G2];
		client.refresh();
		release();
		await until(() => worker.sockets.some((s) => s.channel === G2));
		expect(calls).toBe(2);
		client.disconnect();
	});

	test("a socket that goes silent is replaced; open ones are pinged", async () => {
		const { worker, client } = setup({ channels: [G1] });
		await until(() => worker.sockets.length === 1);
		worker.latest(G1).hello(1, false);
		await until(() => worker.sockets[0]!.sent.includes("ping"));
		await until(() => worker.sockets.length === 2);
		// Replaced without waiting for the dead socket's close event, which may never come.
		expect(worker.sockets[0]!.readyState).toBe(2);
		expect(worker.latest(G1).since).toBe("1");
		client.disconnect();
	});

	test("a channel that says hello and drops at once keeps backing off; one that stayed up starts over", async () => {
		const clock = { now: 1_000_000 };
		const attempts: number[] = [];
		const { worker, client } = setup({
			channels: [G1],
			now: () => clock.now,
			retryMs: (n) => (attempts.push(n), 5),
		});
		for (let round = 1; round <= 3; round++) {
			await until(() => worker.sockets.length === round);
			worker.latest(G1).hello(1, round > 1);
			worker.latest(G1).drop();
		}
		expect(attempts).toEqual([1, 2, 3]);
		await until(() => worker.sockets.length === 4);
		worker.latest(G1).hello(1, true);
		clock.now += 30_000;
		worker.latest(G1).drop();
		expect(attempts).toEqual([1, 2, 3, 1]);
		client.disconnect();
	});

	test("while the API says slow down, channels wait out one shared backoff instead of each asking for a token", async () => {
		let calls = 0;
		let staggered = 0;
		const { worker, client } = setup({
			channels: [ME, G1, G2],
			getToken: async () => {
				if (++calls > 1)
					throw new ApiError(403, "challenged", "Paradev is busy.");
				return {
					token: jwt(Math.floor(Date.now() / 1000) + 600),
					channels: [ME, G1, G2],
				};
			},
			// Refused upgrades below: the channels come back for a fresh token 10 ms apart.
			retryMs: (_, err) => (isSlowDown(err) ? 80 : 5 + 10 * staggered++),
		});
		await until(() => worker.sockets.length === 3);
		for (const socket of worker.sockets) socket.drop();
		await until(() => calls === 2);
		await Bun.sleep(40);
		expect(calls).toBe(2);
		await until(() => calls === 3);
		client.disconnect();
	});

	describe("check, when the app comes back to the foreground", () => {
		// A slow heartbeat, so only `check` can notice a dead socket within the test.
		const slow = { pingMs: 10_000, silentMs: 60_000 };

		test("a socket that doesn't answer its ping in time is replaced at once, resuming from its last seq", async () => {
			const { worker, client, seen, counts } = setup({
				channels: [ME, G1],
				...slow,
			});
			await until(() => worker.sockets.length === 2);
			worker.latest(ME).hello(1, false);
			worker.latest(G1).hello(4, false);
			worker.latest(G1).push(5);
			client.check();
			expect(worker.latest(ME).sent).toEqual(["ping"]);
			expect(worker.latest(G1).sent).toEqual(["ping"]);
			// ME answers; G1 died while the app was away.
			worker.latest(ME).pong();
			await until(() => worker.sockets.length === 3);
			expect(worker.sockets[1]!.readyState).toBe(2);
			expect(worker.latest(G1).since).toBe("5");
			worker.latest(G1).hello(6, true);
			worker.latest(G1).push(6);
			expect(seen).toEqual([event(5), event(6)]);
			expect(counts().resyncs).toBe(1);
			await Bun.sleep(40);
			expect(worker.sockets.length).toBe(3);
			client.disconnect();
		});

		test("says it's checking from the pings until every socket has answered or been replaced", async () => {
			const { worker, client, checking, states } = setup({
				channels: [ME, G1],
				...slow,
			});
			await until(() => worker.sockets.length === 2);
			worker.latest(ME).hello(1, false);
			worker.latest(G1).hello(1, false);
			client.check();
			expect(checking).toEqual([true]);
			worker.latest(ME).pong();
			expect(checking).toEqual([true]);
			// G1 never answers: replaced, it's reconnecting rather than checking.
			await until(() => worker.sockets.length === 3);
			expect(checking).toEqual([true, false]);
			expect(states.at(-1)).toBe("reconnecting");
			worker.latest(G1).hello(1, true);
			expect(states.at(-1)).toBe("connected");
			client.disconnect();
		});

		test("a resync's bootstrap is asked for before connected is reported", async () => {
			const order: string[] = [];
			const worker = fakeWorker();
			const client = connectRealtime({
				url: "ws://worker.test/realtime",
				getToken: async () => ({
					token: jwt(Math.floor(Date.now() / 1000) + 600, "t"),
					channels: [G1],
				}),
				onEvent: () => {},
				onState: (s) => void order.push(s),
				onResync: () => void order.push("resync"),
				onUnauthorized: () => {},
				socket: worker.factory,
				timing: {
					retryMs: () => 5,
					pingMs: 10_000,
					silentMs: 60_000,
					resyncWaitMs: 30,
					probeMs: 20,
				},
			});
			await until(() => worker.sockets.length === 1);
			worker.latest(G1).hello(1, false);
			expect(order.slice(-2)).toEqual(["resync", "connected"]);
			client.disconnect();
		});

		test("sockets that answer are kept", async () => {
			const { worker, client } = setup({ channels: [G1], ...slow });
			await until(() => worker.sockets.length === 1);
			worker.latest(G1).hello(1, false);
			client.check();
			worker.latest(G1).pong();
			await Bun.sleep(40);
			expect(worker.sockets.length).toBe(1);
			client.disconnect();
		});

		test("a closed socket, or a channel waiting out its backoff, reconnects without waiting", async () => {
			const { worker, client } = setup({
				channels: [G1],
				retryMs: () => 10_000,
				...slow,
			});
			await until(() => worker.sockets.length === 1);
			worker.latest(G1).hello(3, false);
			worker.latest(G1).drop();
			await Bun.sleep(20);
			expect(worker.sockets.length).toBe(1);
			client.check();
			await until(() => worker.sockets.length === 2);
			expect(worker.latest(G1).since).toBe("3");
			// Closed underneath us with no close event yet: replaced at once too.
			worker.latest(G1).hello(3, true);
			worker.latest(G1).readyState = 3;
			client.check();
			await until(() => worker.sockets.length === 3);
			client.disconnect();
		});
	});

	test("a session the API no longer accepts stops the client", async () => {
		const { worker, counts } = setup({
			getToken: async () => {
				throw new ApiError(401, "unauthorized", "Session expired");
			},
		});
		await until(() => counts().unauthorized === 1);
		await Bun.sleep(20);
		expect(worker.sockets).toEqual([]);
	});
});
