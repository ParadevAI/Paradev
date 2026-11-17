import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import {
	ACP_PROTOCOL_VERSION,
	createTurnWatches,
	type SocketConstructor,
	watchSession,
} from "./turn-watch.ts";

type Listener = (event: unknown) => void;

/** A box's ACP endpoint in memory: answers `initialize` and `session/load`, replays history, can push or drop. */
function fakeBox(history: SessionUpdate[] = []) {
	const sockets: FakeSocket[] = [];
	class FakeSocket {
		readyState = 0;
		readonly sent: { method?: string; params?: Record<string, unknown> }[] = [];
		private readonly listeners = new Map<string, Set<Listener>>();
		constructor(
			readonly url: string,
			readonly protocols: string[],
		) {
			sockets.push(this);
			queueMicrotask(() => {
				this.readyState = 1;
				this.fire("open", {});
			});
		}
		addEventListener(type: string, listener: Listener) {
			const set = this.listeners.get(type) ?? new Set();
			set.add(listener);
			this.listeners.set(type, set);
		}
		removeEventListener(type: string, listener: Listener) {
			this.listeners.get(type)?.delete(listener);
		}
		send(data: string) {
			const message = JSON.parse(data) as {
				id?: number;
				method?: string;
				params?: Record<string, unknown>;
			};
			this.sent.push(message);
			if (message.method === "initialize")
				this.reply(message.id!, {
					protocolVersion: 1,
					agentCapabilities: { loadSession: true },
				});
			if (message.method === "session/load") {
				for (const update of history) this.push(update);
				this.reply(message.id!, {});
			}
		}
		push(update: SessionUpdate) {
			this.fire("message", {
				data: JSON.stringify({
					jsonrpc: "2.0",
					method: "session/update",
					params: { sessionId: "g1", update },
				}),
			});
		}
		/** The box (or the network) ends the connection. */
		drop() {
			if (this.readyState === 3) return;
			this.readyState = 3;
			this.fire("close", { code: 1006 });
		}
		close() {
			this.drop();
		}
		private reply(id: number, result: unknown) {
			queueMicrotask(() =>
				this.fire("message", {
					data: JSON.stringify({ jsonrpc: "2.0", id, result }),
				}),
			);
		}
		private fire(type: string, event: unknown) {
			for (const listener of this.listeners.get(type) ?? []) listener(event);
		}
	}
	return { sockets, WebSocket: FakeSocket as unknown as SocketConstructor };
}

const text = (t: string): SessionUpdate => ({
	sessionUpdate: "agent_message_chunk",
	content: { type: "text", text: t },
});
const until = async (check: () => boolean) => {
	for (let i = 0; i < 200 && !check(); i++) await Bun.sleep(2);
	expect(check()).toBe(true);
};

function watch(box: ReturnType<typeof fakeBox>) {
	const updates: SessionUpdate[] = [];
	const lost: unknown[] = [];
	let tickets = 0;
	const stop = watchSession({
		ticket: async () => ({
			acpUrl: "ws://127.0.0.1:5000/acp",
			token: `jwt-${++tickets}`,
			sessionId: "g1",
		}),
		onUpdate: (u) => updates.push(u),
		onLost: (err) => lost.push(err),
		WebSocket: box.WebSocket,
	});
	return { updates, lost, stop, tickets: () => tickets };
}

describe("watching a box", () => {
	test("connects with the token as a subprotocol, loads the group's session, and streams replay then live updates", async () => {
		const box = fakeBox([text("replayed")]);
		const w = watch(box);
		await until(() => w.updates.length === 1);
		const [socket] = box.sockets;
		expect(socket!.url).toBe("ws://127.0.0.1:5000/acp");
		expect(socket!.protocols).toEqual(["acp", "jwt-1"]);
		expect(socket!.sent.map((m) => m.method)).toEqual([
			"initialize",
			"session/load",
		]);
		expect(socket!.sent[1]!.params).toMatchObject({ sessionId: "g1" });

		socket!.push(text("live"));
		await until(() => w.updates.length === 2);
		expect(w.updates).toEqual([text("replayed"), text("live")]);
		w.stop();
		expect(socket!.readyState).toBe(3);
		expect(w.lost).toEqual([]);
	});

	test("reconnects once, with a fresh token, when the socket drops; gives up on the second drop", async () => {
		const box = fakeBox();
		const w = watch(box);
		await until(() => box.sockets[0]?.sent.length === 2);
		box.sockets[0]!.drop();
		await until(() => box.sockets[1]?.sent.length === 2);
		expect(box.sockets[1]!.protocols).toEqual(["acp", "jwt-2"]);
		expect(w.lost).toEqual([]);

		box.sockets[1]!.drop();
		await until(() => w.lost.length === 1);
		await Bun.sleep(10);
		expect(box.sockets).toHaveLength(2);
	});

	test("stopping doesn't count as a drop: no reconnect, nothing reported", async () => {
		const box = fakeBox();
		const w = watch(box);
		await until(() => box.sockets[0]?.sent.length === 2);
		w.stop();
		box.sockets[0]!.push(text("late"));
		await Bun.sleep(10);
		expect(box.sockets).toHaveLength(1);
		expect(w.updates).toEqual([]);
		expect(w.lost).toEqual([]);
	});

	test("a ticket that isn't a websocket URL is refused before connecting", async () => {
		const box = fakeBox();
		const lost: unknown[] = [];
		watchSession({
			ticket: async () => ({
				acpUrl: "https://evil.example/acp",
				token: "jwt",
				sessionId: "g1",
			}),
			onUpdate: () => {},
			onLost: (err) => lost.push(err),
			WebSocket: box.WebSocket,
		});
		await until(() => lost.length === 1);
		expect(box.sockets).toHaveLength(0);
	});
});

test("asks for the protocol version the ACP SDK speaks", () => {
	expect(ACP_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
});

describe("which turns are watched", () => {
	const turn = (turnId: string, groupId: string) => ({
		turnId,
		devId: "m1",
		groupId,
	});

	test("the chat on screen's running turns, started once each, stopped when they end or the chat changes", async () => {
		const box = fakeBox();
		const seen: [string, SessionUpdate][] = [];
		const tickets: string[] = [];
		const watches = createTurnWatches({
			ticket: async (devId, groupId) => (
				tickets.push(`${devId}/${groupId}`),
				{ acpUrl: "ws://box/acp", token: "jwt", sessionId: groupId }
			),
			onUpdate: (turnId, update) => seen.push([turnId, update]),
			WebSocket: box.WebSocket,
		});
		watches.update([turn("t1", "g1"), turn("t2", "g2")], "g1");
		watches.update([turn("t1", "g1"), turn("t2", "g2")], "g1");
		await until(() => box.sockets[0]?.sent.length === 2);
		expect(tickets).toEqual(["m1/g1"]);
		box.sockets[0]!.push(text("hi"));
		await until(() => seen.length === 1);
		expect(seen).toEqual([["t1", text("hi")]]);

		watches.update([turn("t2", "g2")], "g1");
		expect(box.sockets[0]!.readyState).toBe(3);
		watches.update([turn("t2", "g2")], "g2");
		await until(() => box.sockets[1]?.sent.length === 2);
		watches.stop();
		expect(box.sockets[1]!.readyState).toBe(3);
	});

	test("a turn the box won't serve isn't tried again", async () => {
		const box = fakeBox();
		let tickets = 0;
		const watches = createTurnWatches({
			ticket: async () => {
				tickets++;
				throw new Error("forbidden");
			},
			onUpdate: () => {},
			WebSocket: box.WebSocket,
		});
		watches.update([turn("t1", "g1")], "g1");
		await until(() => tickets === 2);
		await Bun.sleep(5);
		watches.update([turn("t1", "g1")], "g1");
		await Bun.sleep(5);
		expect(tickets).toBe(2);
	});
});
