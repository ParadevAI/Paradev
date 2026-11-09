import { describe, expect, test } from "bun:test";
import type { PagePresenceViewer, PresenceVisitor } from "./page-presence";
import { openPagePresence } from "./page-presence-client";

type Event = { data?: unknown; code?: number };

class FakeSocket {
	sent: string[] = [];
	closed = false;
	listeners = new Map<string, ((event: Event) => void)[]>();
	constructor(public url: string) {}
	addEventListener(type: string, listener: (event: Event) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.closed = true;
	}
	emit(type: string, event: Event = {}) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
	hub(message: unknown) {
		this.emit("message", { data: JSON.stringify(message) });
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean) {
	for (let tries = 0; tries < 500 && !condition(); tries++) await sleep(1);
	expect(condition()).toBe(true);
}

function harness(
	options: {
		heartbeatMs?: number;
		urls?: (string | null)[];
		recheckJitterMs?: number;
	} = {},
) {
	const sockets: FakeSocket[] = [];
	const states: PagePresenceViewer[][] = [];
	const visits: PresenceVisitor[][] = [];
	let published = 0;
	const urls = [...(options.urls ?? [])];
	let dialled = 0;
	const client = openPagePresence({
		url: async () => {
			dialled += 1;
			return urls.length ? (urls.shift() ?? null) : `wss://hub/${dialled}`;
		},
		onViewers: (viewers) => states.push(viewers),
		onVisitors: (visitors) => visits.push(visitors),
		onPublished: () => {
			published += 1;
		},
		createSocket: (address) => {
			const socket = new FakeSocket(address);
			sockets.push(socket);
			return socket;
		},
		retryBaseMs: 1,
		recheckJitterMs: options.recheckJitterMs ?? 1,
		heartbeatMs: options.heartbeatMs ?? 60_000,
	});
	const opened = async () => {
		await until(() => sockets.length > 0);
		const socket = sockets.at(-1) as FakeSocket;
		socket.emit("open");
		return socket;
	};
	return {
		client,
		sockets,
		states,
		visits,
		opened,
		dialled: () => dialled,
		published: () => published,
	};
}

const grace = {
	id: "c2",
	key: "k2",
	name: "Grace",
	image: null,
	guest: false,
	guestNumber: null,
	color: 1,
};

describe("openPagePresence", () => {
	test("takes the viewer list from the hub, validated", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace, { id: 7 }] });
		expect(h.states.at(-1)).toEqual([grace]);
		h.client.stop();
	});

	test("takes the visitor history from the hub, validated", async () => {
		const h = harness();
		const socket = await h.opened();
		const ada = {
			userId: "u1",
			name: "Ada",
			image: null,
			lastSeenAt: 5,
			active: true,
		};
		socket.hub({
			type: "presence",
			viewers: [],
			visitors: [ada, { userId: "u2", name: "Bob" }],
		});
		expect(h.visits.at(-1)).toEqual([ada]);
		socket.emit("close", { code: 1006 });
		expect(h.visits.at(-1)).toEqual([{ ...ada, active: false }]);
		h.client.stop();
	});

	test("tells the host when the hub says a version was published", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace] });
		expect(h.published()).toBe(0);
		socket.hub({ type: "published" });
		expect(h.published()).toBe(1);
		expect(h.states.at(-1)).toEqual([grace]);
		h.client.stop();
	});

	test("checks for a missed publish after a reconnect, not on the first connect", async () => {
		const h = harness();
		const socket = await h.opened();
		expect(h.published()).toBe(0);
		socket.emit("close", { code: 1006 });
		await until(() => h.sockets.length === 2);
		h.sockets[1]?.emit("open");
		await until(() => h.published() === 1);
		h.client.stop();
	});

	test("checks for a missed publish when the first dial failed and a retry connects", async () => {
		const h = harness({ urls: [null] });
		const socket = await h.opened();
		expect(h.sockets).toHaveLength(1);
		expect(h.dialled()).toBe(2);
		await until(() => h.published() === 1);
		socket.hub({ type: "presence", viewers: [] });
		h.client.stop();
	});

	test("a published message cancels the pending reconnect check", async () => {
		const h = harness({ recheckJitterMs: 50 });
		const first = await h.opened();
		first.emit("close", { code: 1006 });
		await until(() => h.sockets.length === 2);
		const second = h.sockets[1] as FakeSocket;
		second.emit("open");
		second.hub({ type: "published" });
		await sleep(80);
		expect(h.published()).toBe(1);
		h.client.stop();
	});

	test("a dropped socket clears everyone and dials again with a fresh url", async () => {
		const h = harness();
		const socket = await h.opened();
		socket.hub({ type: "presence", viewers: [grace] });
		socket.emit("close", { code: 1006 });
		expect(h.states.at(-1)).toEqual([]);
		await until(() => h.sockets.length === 2);
		expect(h.sockets[1]?.url).toBe("wss://hub/2");
		h.client.stop();
	});

	test("a refused or full page is not dialled again", async () => {
		for (const code of [4403, 4429]) {
			const h = harness();
			const socket = await h.opened();
			socket.emit("close", { code });
			await sleep(10);
			expect(h.sockets.length).toBe(1);
			h.client.stop();
		}
	});

	test("no url yet means try again later", async () => {
		const h = harness({ urls: [null, null] });
		await until(() => h.sockets.length === 1);
		expect(h.dialled()).toBe(3);
		h.client.stop();
	});

	test("a socket that answered pings and then went quiet is replaced", async () => {
		const h = harness({ heartbeatMs: 2 });
		const socket = await h.opened();
		socket.emit("message", { data: "pong" });
		await until(() => h.sockets.length === 2);
		expect(socket.closed).toBe(true);
		h.client.stop();
	});

	test("a hub that never answers pings is kept", async () => {
		const h = harness({ heartbeatMs: 2 });
		const socket = await h.opened();
		await until(() => socket.sent.filter((s) => s === "ping").length >= 4);
		expect(h.sockets.length).toBe(1);
		h.client.stop();
	});

	test("stop closes the socket and dials no more", async () => {
		const h = harness();
		const socket = await h.opened();
		h.client.stop();
		socket.emit("close", { code: 1006 });
		await sleep(10);
		expect(socket.closed).toBe(true);
		expect(h.sockets.length).toBe(1);
	});
});
