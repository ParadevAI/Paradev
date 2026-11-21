import { afterEach, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import type { PortForward } from "shared/types";
import { WebSocketServer } from "ws";
import { ForwardReporter } from "./forward-reporter";

const servers: WebSocketServer[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

function hub() {
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	servers.push(server);
	const messages: string[] = [];
	const auth: string[] = [];
	let closed = 0;
	server.on("connection", (socket, request) => {
		auth.push(request.headers.authorization ?? "");
		socket.on("message", (data) => messages.push(String(data)));
		socket.on("close", () => closed++);
	});
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}/organization/o/workspace/ws1/forwards`,
		messages,
		auth,
		closed: () => closed,
	};
}

function forward(
	remotePort: number,
	localPort: number,
	explicit = true,
): PortForward {
	return {
		id: `h|ws1|${remotePort}`,
		target: { hostUrl: "h", workspaceId: "ws1", remotePort },
		status: { state: "active", localPort },
		transport: "relay",
		connections: 0,
		explicit,
		localPort,
	};
}

const until = async (check: () => boolean) => {
	for (let i = 0; i < 100 && !check(); i++) {
		await new Promise((r) => setTimeout(r, 10));
	}
};

test("reports a workspace's explicit forwards with the token, once per change, and leaves when they end", async () => {
	const server = hub();
	const reporter = new ForwardReporter({ getToken: () => "jwt" });
	reporter.setReportUrl("ws1", server.url);

	reporter.sync([forward(5173, 5174), forward(9000, 9000, false)]);
	await until(() => server.messages.length === 1);
	expect(server.auth[0]).toBe("Bearer jwt");
	expect(JSON.parse(server.messages[0] ?? "")).toEqual({
		type: "forwards",
		forwards: [{ port: 5173, localPort: 5174 }],
	});

	reporter.sync([forward(5173, 5174)]);
	reporter.sync([forward(3000, 3000), forward(5173, 5174)]);
	await until(() => server.messages.length === 2);
	expect(JSON.parse(server.messages[1] ?? "").forwards).toEqual([
		{ port: 3000, localPort: 3000 },
		{ port: 5173, localPort: 5174 },
	]);

	reporter.sync([]);
	await until(() => server.closed() === 1);
	expect(server.closed()).toBe(1);
	expect(server.messages.length).toBe(2);
});

test("a hub that keeps refusing is not hammered, and a refused token is not retried", async () => {
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	servers.push(server);
	let connections = 0;
	server.on("connection", (socket) => {
		connections++;
		socket.close(4401, "Unauthorized");
	});
	const { port } = server.address() as AddressInfo;
	let token = "stale";
	const reporter = new ForwardReporter({
		getToken: () => token,
		timing: { retryMinMs: 20, retryMaxMs: 1_000, stableMs: 1_000 },
	});
	reporter.setReportUrl("ws1", `http://127.0.0.1:${port}/f`);
	reporter.sync([forward(5173, 5173)]);

	await new Promise((r) => setTimeout(r, 300));
	expect(connections).toBe(1);

	token = "fresh";
	await until(() => connections === 2);
	expect(connections).toBe(2);
	reporter.stopAll();
});
