import {
	afterEach,
	beforeEach,
	expect,
	jest,
	mock,
	spyOn,
	test,
} from "bun:test";
import { ControlHeartbeat } from "./control-heartbeat";

let elapsed = 0;

beforeEach(() => {
	jest.useFakeTimers();
	elapsed = 0;
	spyOn(performance, "now").mockImplementation(() => elapsed);
});

afterEach(() => {
	mock.restore();
	jest.useRealTimers();
});

function advance(ms: number) {
	for (let step = 0; step < ms; step += 100) {
		elapsed += 100;
		jest.advanceTimersByTime(100);
	}
}

function makeHeartbeat() {
	const sendPing = mock(() => {});
	const onDead = mock(
		(_details: { silentForMs: number; pongTimeoutMs: number }) => {},
	);
	const heartbeat = new ControlHeartbeat({
		sendPing,
		onDead,
		pingIntervalMs: 15_000,
		minPongTimeoutMs: 5_000,
		maxPongTimeoutMs: 10_000,
	});
	return { heartbeat, sendPing, onDead };
}

test("a socket that answers every ping is never declared dead", () => {
	const { heartbeat, sendPing, onDead } = makeHeartbeat();
	heartbeat.start();
	for (let i = 0; i < 10; i++) {
		advance(15_000);
		advance(100);
		heartbeat.onInbound(true);
	}
	expect(sendPing).toHaveBeenCalledTimes(10);
	expect(onDead).not.toHaveBeenCalled();
});

test("a socket that stops answering is declared dead within one interval plus the pong deadline", () => {
	const { heartbeat, onDead } = makeHeartbeat();
	heartbeat.start();
	advance(15_000);
	advance(200);
	heartbeat.onInbound(true);
	expect(heartbeat.pongTimeoutMs()).toBe(5_000);

	advance(14_800 + 4_900);
	expect(onDead).not.toHaveBeenCalled();
	advance(100);
	expect(onDead).toHaveBeenCalledTimes(1);
	expect(onDead.mock.calls[0]?.[0]).toEqual({
		silentForMs: 19_800,
		pongTimeoutMs: 5_000,
	});
});

test("the pong deadline grows with a slow link but stays below the ping interval", () => {
	const { heartbeat, onDead } = makeHeartbeat();
	heartbeat.start();
	advance(15_000);
	advance(2_000);
	heartbeat.onInbound(true);
	expect(heartbeat.pongTimeoutMs()).toBe(8_000);
	advance(13_000);
	advance(7_900);
	expect(onDead).not.toHaveBeenCalled();
	heartbeat.onInbound(true);
	expect(heartbeat.pongTimeoutMs()).toBe(10_000);
});

test("any inbound frame satisfies a pending ping", () => {
	const { heartbeat, onDead } = makeHeartbeat();
	heartbeat.start();
	advance(15_000);
	heartbeat.onInbound(false);
	advance(14_000);
	expect(onDead).not.toHaveBeenCalled();
});

test("stop cancels a pending deadline", () => {
	const { heartbeat, onDead } = makeHeartbeat();
	heartbeat.start();
	advance(15_000);
	heartbeat.stop();
	advance(60_000);
	expect(onDead).not.toHaveBeenCalled();
});
