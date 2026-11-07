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
let holdAcks = false;
const heldAcks: (() => void)[] = [];
let onAckHeld: (() => void) | null = null;
const server = net.createServer((socket) => {
	sockets.push(socket);
	const decoder = new FrameDecoder();
	socket.on("data", (chunk) => {
		decoder.push(chunk);
		for (const { message } of decoder.drain()) {
			if ((message as { type: string }).type !== "hello") continue;
			const ack = () =>
				socket.write(
					encodeFrame({
						type: "hello-ack",
						protocol: CURRENT_PROTOCOL_VERSION,
						daemonVersion: "test",
					}),
				);
			if (!holdAcks) {
				ack();
				continue;
			}
			heldAcks.push(ack);
			onAckHeld?.();
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

test("a connect that outlives dispose does not replace the newer client", async () => {
	await disposeDaemonClient();
	holdAcks = true;
	const staleHeld = new Promise<void>((resolve) => {
		onAckHeld = resolve;
	});
	const stale = getDaemonClient();
	await staleHeld;
	holdAcks = false;
	const disposing = disposeDaemonClient();
	const fresh = await getDaemonClient();
	heldAcks.shift()?.();
	const [staleClient] = await Promise.all([stale, disposing]);

	expect(await getDaemonClient()).toBe(fresh);
	expect(staleClient.isConnected).toBe(false);
});

test("a connect that fails after dispose does not start a duplicate of the newer one", async () => {
	await disposeDaemonClient();
	const before = sockets.length;
	holdAcks = true;
	let held = 0;
	const bothHeld = new Promise<void>((resolve) => {
		onAckHeld = () => {
			if (++held === 2) resolve();
		};
	});
	const stale = getDaemonClient().catch(() => null);
	const disposing = disposeDaemonClient();
	const fresh = getDaemonClient();
	await bothHeld;
	sockets[before]?.write(encodeFrame({ type: "error", message: "refused" }));
	await Promise.all([stale, disposing]);
	const third = getDaemonClient();
	holdAcks = false;
	heldAcks.splice(0).pop()?.();

	expect(await third).toBe(await fresh);
	expect(sockets).toHaveLength(before + 2);
});
