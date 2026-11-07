/// <reference types="bun" />
import { expect, mock, test } from "bun:test";
import type { Connection } from "partyserver";

const { HostTunnel } = await import("./host-tunnel");

function socket(id: string, kind: "host" | "client" | "dial") {
	return {
		id,
		tags: kind === "host" ? ["host"] : [],
		state: { kind, hostId: "org:host", ticket: "ticket" },
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

function tunnelWith(connections: Connection[]) {
	const tunnel = new HostTunnel({} as never, {} as never);
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
