import { afterEach, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "../../test/helpers/client.ts";
import type { HelloAckMessage } from "../protocol/index.ts";
import { Server } from "./Server.ts";

let server: Server | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

async function startServer(
	probeTrustd: () => Promise<boolean>,
	trustdRefreshTimeoutMs?: number,
): Promise<string> {
	const socketPath = join(tmpdir(), `trustd-${crypto.randomUUID()}.sock`);
	server = new Server({
		socketPath,
		daemonVersion: "test",
		probeTrustd,
		trustdRefreshTimeoutMs,
	});
	await server.listen();
	return socketPath;
}

async function hello(
	socketPath: string,
	refreshTrustd: boolean,
): Promise<HelloAckMessage> {
	const client = await connect(socketPath);
	client.send({ type: "hello", protocols: [2], refreshTrustd });
	const ack = await client.waitFor((m) => m.type === "hello-ack");
	await client.close();
	if (ack.type !== "hello-ack") throw new Error(`unexpected ${ack.type}`);
	return ack;
}

test("a refreshTrustd hello re-probes, so a login session that ended after startup reports degraded", async () => {
	const answers = [true, false];
	let probes = 0;
	const socketPath = await startServer(async () => answers[probes++] ?? false);
	await server?.refreshTrustdHealthy();

	expect((await hello(socketPath, false)).trustdHealthy).toBe(true);
	expect(probes).toBe(1);

	expect((await hello(socketPath, true)).trustdHealthy).toBe(false);
	expect(probes).toBe(2);
	expect((await hello(socketPath, false)).trustdHealthy).toBe(false);
});

test("a slow probe acks without a trustd value, and one probe serves concurrent hellos", async () => {
	let finishProbe: (healthy: boolean) => void = () => {};
	let probes = 0;
	const socketPath = await startServer(() => {
		probes++;
		return new Promise((resolve) => {
			finishProbe = resolve;
		});
	}, 10);

	const acks = await Promise.all([
		hello(socketPath, true),
		hello(socketPath, true),
	]);
	expect(acks.map((ack) => ack.trustdHealthy)).toEqual([undefined, undefined]);
	expect(probes).toBe(1);

	finishProbe(false);
	await server?.refreshTrustdHealthy();
	expect((await hello(socketPath, false)).trustdHealthy).toBe(false);
});
