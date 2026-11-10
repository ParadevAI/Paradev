import { afterEach, describe, expect, it } from "bun:test";
import { createRelaySocket, type RelaySocket } from "./relaySocket";

// Local WS server whose /hosts/:id status is scriptable. Like the relay, it
// answers the `_whoowns` preflight and the upgrade with the same status.
function makeServer(getStatus: () => number) {
	const tokensSeen: string[] = [];
	const probes = { count: 0 };
	const opened = { count: 0 };
	const sockets: { close(): void }[] = [];
	const server = Bun.serve({
		port: 0,
		fetch(req, srv) {
			const url = new URL(req.url);
			const status = url.pathname.startsWith("/hosts/") ? getStatus() : 200;
			if (url.pathname.endsWith("/_whoowns")) {
				probes.count++;
				return new Response(
					status === 200 ? JSON.stringify({ ok: true }) : "{}",
					{ status },
				);
			}
			tokensSeen.push(url.searchParams.get("token") ?? "");
			if (status !== 200) return new Response("no", { status });
			if (srv.upgrade(req)) return;
			return new Response("no", { status: 400 });
		},
		websocket: {
			open(ws) {
				opened.count++;
				sockets.push(ws);
				ws.send("hello");
			},
			message() {},
		},
	});
	return { server, tokensSeen, probes, opened, sockets, port: server.port };
}

const HOST_PATH = "/hosts/org-1:machine-1/events";
let socket: RelaySocket | null = null;

afterEach(() => {
	socket?.close();
	socket = null;
});

function waitFor(cond: () => boolean, timeoutMs = 3_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const t = setInterval(() => {
			if (cond()) {
				clearInterval(t);
				resolve();
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(t);
				reject(new Error("waitFor timeout"));
			}
		}, 20);
	});
}

describe("createRelaySocket", () => {
	it("signs every attempt with a fresh token", async () => {
		const { server, tokensSeen, port } = makeServer(() => 200);
		let tokenVersion = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => `tok-${++tokenVersion}`,
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => tokensSeen.length >= 1);
		// Force a reconnect; the next dial must carry a NEW token.
		socket.reconnect();
		await waitFor(() => tokensSeen.length >= 2);
		expect(tokensSeen[0]).toBe("tok-1");
		expect(tokensSeen[1]).not.toBe(tokensSeen[0]);
		server.stop(true);
	});

	it("closes permanently on preflight 403", async () => {
		const { server, tokensSeen, port } = makeServer(() => 403);
		let denied = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => "tok",
			onAccessDenied: () => denied++,
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => denied === 1);
		await Bun.sleep(200);
		expect(denied).toBe(1); // no retry loop after fatal close
		expect(tokensSeen.length).toBe(1); // only the unprobed first dial
		expect(socket.readyState).toBe(3); // CLOSED
		server.stop(true);
	});

	it("keeps re-probing at accessDeniedRetryMs and recovers when access is granted", async () => {
		let status = 403;
		const { server, opened, port } = makeServer(() => status);
		let denied = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => "tok",
			onAccessDenied: () => denied++,
			accessDeniedRetryMs: 50,
			minReconnectionDelay: 10,
			maxReconnectionDelay: 20,
		});
		await waitFor(() => denied >= 2); // still polling, not closed
		status = 200; // access granted
		await waitFor(() => opened.count >= 1);
		expect(socket.readyState).toBeLessThanOrEqual(1); // CONNECTING or OPEN
		server.stop(true);
	});

	it("skips the preflight on the first dial and probes before a retry", async () => {
		const { server, probes, opened, sockets, port } = makeServer(() => 200);
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => "tok",
			minReconnectionDelay: 10,
			maxReconnectionDelay: 20,
		});
		await waitFor(() => opened.count === 1);
		expect(probes.count).toBe(0);

		for (const ws of sockets) ws.close();
		await waitFor(() => opened.count === 2);
		expect(probes.count).toBe(1);
		server.stop(true);
	});

	it("retries a failed unprobed first dial at once, with the preflight", async () => {
		const { server, probes, port } = makeServer(() => 403);
		let denied = 0;
		socket = createRelaySocket({
			buildUrl: () => `ws://localhost:${port}${HOST_PATH}`,
			getToken: () => "tok",
			onAccessDenied: () => denied++,
			minReconnectionDelay: 60_000,
			maxReconnectionDelay: 60_000,
		});
		await waitFor(() => denied === 1, 1_000);
		expect(probes.count).toBe(1);
		server.stop(true);
	});

	it("dials local (non-/hosts) URLs without a preflight, converting http to ws", async () => {
		const { server, tokensSeen, port } = makeServer(() => 503);
		socket = createRelaySocket({
			buildUrl: () => `http://localhost:${port}/events`,
			getToken: () => "psk-1",
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => tokensSeen.length >= 1);
		expect(tokensSeen[0]).toBe("psk-1");
		server.stop(true);
	});
});
