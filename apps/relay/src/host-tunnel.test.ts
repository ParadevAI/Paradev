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
		close: mock(() => {}),
	} as unknown as Connection;
}

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
