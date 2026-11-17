import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { joinPresence } from "./presenceStore";

type Listener = (event: { data?: unknown; code?: number }) => void;

class FakeSocket {
	static opened: FakeSocket[] = [];
	closed = false;
	listeners = new Map<string, Listener[]>();
	constructor(public url: string) {
		FakeSocket.opened.push(this);
	}
	addEventListener(type: string, listener: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	send() {}
	close() {
		this.closed = true;
	}
	hub(message: unknown) {
		for (const listener of this.listeners.get("message") ?? []) {
			listener({ data: JSON.stringify(message) });
		}
	}
}

const realWebSocket = globalThis.WebSocket;

async function dialled(): Promise<FakeSocket> {
	for (let tries = 0; tries < 100 && FakeSocket.opened.length === 0; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	const socket = FakeSocket.opened.at(-1);
	if (!socket) throw new Error("the room never dialled");
	return socket;
}

describe("joinPresence", () => {
	beforeEach(() => {
		FakeSocket.opened = [];
		globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		globalThis.WebSocket = realWebSocket;
	});

	test("tells every holder of a room about a publish, until they leave", async () => {
		const heard: string[] = [];
		const leaveA = joinPresence(
			"page-1",
			async () => "wss://hub/page-1",
			() => heard.push("a"),
		);
		const leaveB = joinPresence(
			"page-1",
			async () => "wss://hub/page-1",
			() => heard.push("b"),
		);
		const socket = await dialled();
		expect(FakeSocket.opened).toHaveLength(1);

		socket.hub({ type: "published" });
		expect(heard).toEqual(["a", "b"]);

		leaveA();
		socket.hub({ type: "published" });
		expect(heard).toEqual(["a", "b", "b"]);
		expect(socket.closed).toBe(false);

		leaveB();
		expect(socket.closed).toBe(true);
	});
});
