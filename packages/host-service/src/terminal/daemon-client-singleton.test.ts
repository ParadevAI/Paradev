import { afterAll, beforeAll, expect, test } from "bun:test";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";

const sockPath = path.join(
	os.tmpdir(),
	`daemon-client-singleton-${process.pid}.sock`,
);
const previousSocket = process.env.SUPERSET_PTY_DAEMON_SOCKET;
const sockets: net.Socket[] = [];
const server = net.createServer((socket) => {
	sockets.push(socket);
	const decoder = new FrameDecoder();
	socket.on("data", (chunk) => {
		decoder.push(chunk);
		for (const { message } of decoder.drain()) {
			if ((message as { type: string }).type === "hello")
				socket.write(
					encodeFrame({
						type: "hello-ack",
						protocol: CURRENT_PROTOCOL_VERSION,
						daemonVersion: "test",
					}),
				);
		}
	});
});

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(sockPath, resolve));
	process.env.SUPERSET_PTY_DAEMON_SOCKET = sockPath;
});

afterAll(async () => {
	await disposeDaemonClient();
	for (const socket of sockets) socket.destroy();
	if (previousSocket === undefined)
		delete process.env.SUPERSET_PTY_DAEMON_SOCKET;
	else process.env.SUPERSET_PTY_DAEMON_SOCKET = previousSocket;
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("concurrent first callers share one daemon connection", async () => {
	const [a, b] = await Promise.all([getDaemonClient(), getDaemonClient()]);

	expect(sockets).toHaveLength(1);
	expect(a).toBe(b);
});
