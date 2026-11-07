import { afterAll, beforeAll, expect, test } from "bun:test";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import { DaemonClient } from "./DaemonClient.ts";

const sockPath = path.join(os.tmpdir(), `daemon-client-${process.pid}.sock`);
const sockets: net.Socket[] = [];
const server = net.createServer((socket) => {
	sockets.push(socket);
	const decoder = new FrameDecoder();
	socket.on("data", (chunk) => {
		decoder.push(chunk);
		for (const frame of decoder.drain()) {
			const msg = frame.message as {
				type: string;
				id: string;
				replay?: boolean;
			};
			if (msg.type === "hello")
				socket.write(
					encodeFrame({
						type: "hello-ack",
						protocol: CURRENT_PROTOCOL_VERSION,
						daemonVersion: "test",
						supportsModeSnapshots: true,
					}),
				);
			if (msg.type === "subscribe") {
				if (msg.replay)
					socket.write(
						encodeFrame({ type: "output", id: msg.id }, Buffer.from("RING")),
					);
				socket.write(
					encodeFrame({ type: "replay-complete", id: msg.id, modes: {} }),
				);
			}
			if (msg.type === "list")
				socket.write(encodeFrame({ type: "list-reply", sessions: [] }));
		}
	});
});

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(sockPath, resolve));
});

afterAll(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a resubscribe ignores the replay of a subscription dropped mid-replay", async () => {
	const client = new DaemonClient({ socketPath: sockPath });
	await client.connect();
	const callbacks = { onOutput() {}, onReplayComplete() {}, onExit() {} };

	const unsubscribeFirst = client.subscribe("t1", { replay: true }, callbacks);
	unsubscribeFirst();
	const output: string[] = [];
	client.subscribe(
		"t1",
		{ replay: true },
		{ ...callbacks, onOutput: (chunk) => output.push(chunk.toString()) },
	);
	await client.waitForReplay("t1");
	const outputAtReplayComplete = [...output];
	await client.list();
	await client.dispose();

	expect(outputAtReplayComplete).toEqual(["RING"]);
	expect(output).toEqual(["RING"]);
});
