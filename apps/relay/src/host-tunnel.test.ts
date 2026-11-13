/// <reference types="bun" />
import { expect, mock, test } from "bun:test";
import type { Connection } from "partyserver";

const { HostTunnel } = await import("./host-tunnel");

function socket(id: string, kind: "host" | "client" | "dial") {
	let state: unknown = { kind, hostId: "org:host", ticket: "ticket" };
	return {
		id,
		tags: kind === "host" ? ["host"] : [],
		get state() {
			return state;
		},
		setState: (next: unknown) => {
			state = next;
		},
		readyState: WebSocket.OPEN,
		send: () => {},
		close: mock(() => {}),
	} as unknown as Connection;
}

const caller = {
	userId: "user-1",
	token: "token",
	preAuthorized: true as const,
};
const answerWithin = <T>(answer: Promise<T>, ms: number) =>
	Promise.race([answer, Bun.sleep(ms).then(() => "no answer yet")]);
const storage = {
	get: async () => undefined,
	put: async () => {},
	getAlarm: async () => null,
	setAlarm: async () => {},
};

function tunnelWith(connections: Connection[]) {
	const tunnel = new HostTunnel({} as never, {} as never);
	Object.assign(tunnel, { ctx: { storage } });
	tunnel.getConnections = ((tag?: string) =>
		connections
			.filter((conn) => !tag || conn.tags.includes(tag))
			.values()) as typeof tunnel.getConnections;
	return tunnel;
}

test("a delayed old control close preserves streams on the replacement tunnel", async () => {
	const oldHost = socket("old", "host");
	const replacement = socket("replacement", "host");
	const client = socket("terminal", "client");
	const dial = socket("terminal-dial", "dial");
	const tunnel = tunnelWith([replacement, client, dial]);

	await tunnel.onClose(oldHost);
	await tunnel.onError(oldHost);

	expect(client.close).not.toHaveBeenCalled();
	expect(dial.close).not.toHaveBeenCalled();
});

test("losing the current control connection still closes its streams", async () => {
	const host = socket("current", "host");
	const client = socket("terminal", "client");
	const dial = socket("terminal-dial", "dial");
	const tunnel = tunnelWith([client, dial]);

	await tunnel.onClose(host);

	expect(client.close).toHaveBeenCalledTimes(1);
	expect(dial.close).toHaveBeenCalledTimes(1);
});

test("losing the control connection answers a stream dial in flight at once", async () => {
	const host = socket("current", "host");
	const connections = [host];
	const tunnel = tunnelWith(connections);

	const prepared = tunnel.prepareStream(caller, "ticket", "/terminal", "");
	await Bun.sleep(0);
	connections.length = 0;
	await tunnel.onClose(host);

	expect(await answerWithin(prepared, 20)).toBe("no-host");
});

test("a dial socket that closes before the response ends fails the HTTP exchange at once", async () => {
	const tickets: string[] = [];
	const host = {
		...socket("current", "host"),
		send: (frame: string) => tickets.push(JSON.parse(frame).ticket),
	} as unknown as Connection;
	const tunnel = tunnelWith([host]);

	const response = tunnel.proxyHttp(caller, {
		method: "GET",
		pathWithQuery: "/trpc/workspace.list",
		headers: {},
		body: new Uint8Array(),
	});
	await Bun.sleep(0);
	const dial = {
		...socket("dial", "dial"),
		state: { kind: "dial", ticket: tickets[0] },
	} as unknown as Connection;
	await tunnel.onClose(dial);

	expect(await answerWithin(response, 20)).toEqual({
		ok: false,
		reason: "dial-failed",
	});
});

test("a replaced control socket that reads open again never receives dials", async () => {
	const replaced = socket("replaced", "host");
	const live = socket("live", "host");
	const tunnel = tunnelWith([replaced, live]);

	await tunnel.onConnect(live, {
		request: new Request("https://relay/register?hostId=org:host"),
	} as never);
	expect(replaced.close).toHaveBeenCalledTimes(1);

	const dialedOn = new Promise<string>((resolve) => {
		for (const conn of [replaced, live]) {
			Object.assign(conn, { send: () => resolve(conn.id) });
		}
	});
	void tunnel.proxyHttp(
		{ userId: "user", token: "", preAuthorized: true },
		{
			method: "GET",
			pathWithQuery: "/trpc/x",
			headers: {},
			body: new Uint8Array(),
		},
	);

	expect(await dialedOn).toBe("live");
	await tunnel.onClose(live);
});
