import { expect, mock, test } from "bun:test";
import { RELAY_CLOSE } from "@superset/shared/tunnel-protocol";
import { TunnelClient } from "./tunnel-client";

async function exerciseDial({
	delayMs,
	rejectFirst = false,
}: {
	delayMs: number;
	rejectFirst?: boolean;
}) {
	let attempts = 0;
	let requests = 0;
	let resultResolve: (value: string) => void = () => {};
	const result = new Promise<string>((resolve) => {
		resultResolve = resolve;
	});
	const local = Bun.serve({
		port: 0,
		fetch(request) {
			requests++;
			expect(request.headers.get("authorization")).toBe("Bearer test-secret");
			expect(request.headers.get("x-superset-relayed")).toBe("1");
			return new Response("proxied successfully");
		},
	});
	const relay = Bun.serve<{ control: boolean }>({
		port: 0,
		async fetch(request, server) {
			const control = new URL(request.url).pathname === "/v2/control";
			if (!control) {
				attempts++;
				if (rejectFirst && attempts === 1) {
					return new Response("temporary failure", { status: 503 });
				}
				await Bun.sleep(delayMs);
			}
			if (server.upgrade(request, { data: { control } })) return;
			return new Response("upgrade failed", { status: 400 });
		},
		websocket: {
			open(socket) {
				if (socket.data.control) {
					socket.send(
						JSON.stringify({
							type: "stream:dial",
							ticket: "test-ticket",
							kind: "http",
							path: "/health",
						}),
					);
				} else {
					socket.send(
						JSON.stringify({
							type: "http:request",
							method: "GET",
							path: "/health",
							headers: {},
						}),
					);
					socket.send(JSON.stringify({ type: "http:end" }));
				}
			},
			message(socket, data) {
				if (typeof data !== "string") return;
				const frame = JSON.parse(data);
				if (frame.type === "ping")
					socket.send(JSON.stringify({ type: "pong" }));
				if (frame.type === "stream:dial-failed") resultResolve("failed");
				if (frame.type === "http:response") expect(frame.status).toBe(200);
				if (frame.type === "http:end") resultResolve("success");
			},
		},
	});
	const client = new TunnelClient({
		relayUrl: `http://127.0.0.1:${relay.port}`,
		hostId: "org:host",
		getAuthToken: async () => "test-token",
		localPort: local.port ?? 0,
		hostServiceSecret: "test-secret",
	});
	const start = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await client.connect();
		const outcome = await Promise.race([
			result,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("Dial did not settle")),
					40_000,
				);
			}),
		]);
		return {
			outcome,
			attempts,
			requests,
			elapsedMs: performance.now() - start,
		};
	} finally {
		clearTimeout(timer);
		client.close();
		relay.stop(true);
		local.stop(true);
	}
}

test("real sockets recover from a rejected upgrade and a slow retry", async () => {
	const result = await exerciseDial({ delayMs: 4_500, rejectFirst: true });
	expect(result.outcome).toBe("success");
	expect(result.attempts).toBe(2);
	expect(result.requests).toBe(1);
}, 45_000);

test("a forbidden control close re-registers the host before reconnecting", async () => {
	let connects = 0;
	let onSecondConnect = () => {};
	const reconnected = new Promise<void>((resolve) => {
		onSecondConnect = resolve;
	});
	const relay = Bun.serve({
		port: 0,
		fetch(request, server) {
			if (server.upgrade(request)) return;
			return new Response("upgrade failed", { status: 400 });
		},
		websocket: {
			open(socket) {
				connects++;
				if (connects === 1) {
					socket.close(
						RELAY_CLOSE.forbidden,
						"Forbidden: host not registered to this account",
					);
					return;
				}
				onSecondConnect();
			},
			message() {},
		},
	});
	let connectsWhenForbidden = 0;
	let recovered = false;
	const onForbidden = mock(async (_reason: string) => {
		connectsWhenForbidden = connects;
		await Bun.sleep(0);
		recovered = true;
	});
	const client = new TunnelClient({
		relayUrl: `http://127.0.0.1:${relay.port}`,
		hostId: "org:host",
		getAuthToken: async () => "test-token",
		localPort: 1,
		hostServiceSecret: "test-secret",
		onForbidden,
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await client.connect();
		await Promise.race([
			reconnected,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("Control never reconnected")),
					4_000,
				);
			}),
		]);
		expect(onForbidden).toHaveBeenCalledTimes(1);
		expect(onForbidden.mock.calls[0]?.[0]).toContain("host not registered");
		expect(connectsWhenForbidden).toBe(1);
		expect(recovered).toBe(true);
		expect(connects).toBe(2);
	} finally {
		clearTimeout(timer);
		client.close();
		relay.stop(true);
	}
});
