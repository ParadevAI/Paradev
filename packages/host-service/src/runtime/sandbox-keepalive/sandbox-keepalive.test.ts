import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { startSandboxKeepalive } from "./sandbox-keepalive";

const timing = { intervalMs: 30, retryBaseMs: 2 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const failure = (httpStatus: number) =>
	Object.assign(new Error(`answered ${httpStatus}`), { data: { httpStatus } });

let store: EventEmitter;
let failures: Error[];
let calls: number;
let stop: () => void;

function start() {
	stop = startSandboxKeepalive({
		store: store as never,
		timing,
		keepalive: async () => {
			calls += 1;
			const error = failures.shift();
			if (error) throw error;
		},
	});
}

beforeEach(() => {
	store = new EventEmitter();
	failures = [];
	calls = 0;
});

afterEach(() => stop());

describe("startSandboxKeepalive", () => {
	test("pings on activity at most once per interval, and not at all when idle", async () => {
		start();
		await sleep(40);
		expect(calls).toBe(0);

		store.emit("activity");
		await sleep(5);
		expect(calls).toBe(1);

		for (let i = 0; i < 5; i++) store.emit("activity");
		await sleep(5);
		expect(calls).toBe(1);
		await sleep(75);
		expect(calls).toBe(2);

		await sleep(80);
		expect(calls).toBe(2);
	});

	test("retries a server error or a lost connection, but not a refusal", async () => {
		failures = [failure(503), new Error("fetch failed")];
		start();
		store.emit("activity");
		await sleep(30);
		expect(calls).toBe(3);

		stop();
		calls = 0;
		failures = [failure(401)];
		start();
		store.emit("activity");
		await sleep(80);
		expect(calls).toBe(1);
	});
});
