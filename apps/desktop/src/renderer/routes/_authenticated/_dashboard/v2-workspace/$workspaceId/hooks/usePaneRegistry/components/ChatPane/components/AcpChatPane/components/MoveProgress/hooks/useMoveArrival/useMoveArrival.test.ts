import { afterEach, expect, test } from "bun:test";

const { cleanup, renderHook } = await import("@testing-library/react");
const { useMoveArrival } = await import("./useMoveArrival");

afterEach(cleanup);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function render(initial: { ready: boolean; live: boolean }, graceMs = 1_000) {
	const calls = { arrived: 0, checks: 0 };
	const hook = renderHook(
		(props: { ready: boolean; live: boolean }) =>
			useMoveArrival({
				...props,
				graceMs,
				pollMs: 5,
				onCheck: () => calls.checks++,
				onArrived: () => calls.arrived++,
			}),
		{ initialProps: initial },
	);
	return { calls, hook };
}

test("a ready move arrives only once its session is live", async () => {
	const { calls, hook } = render({ ready: true, live: false });
	await wait(30);
	expect(calls.arrived).toBe(0);
	expect(calls.checks).toBeGreaterThan(0);

	hook.rerender({ ready: true, live: true });
	expect(calls.arrived).toBe(1);
});

test("a live session arrives when its move becomes ready, and only once", () => {
	const { calls, hook } = render({ ready: false, live: true });
	expect(calls.arrived).toBe(0);

	hook.rerender({ ready: true, live: true });
	expect(calls.arrived).toBe(1);
	hook.rerender({ ready: true, live: false });
	hook.rerender({ ready: true, live: true });
	expect(calls.arrived).toBe(1);
});

test("a ready move arrives after the grace period when no session goes live", async () => {
	const { calls } = render({ ready: true, live: false }, 20);
	await wait(50);
	expect(calls.arrived).toBe(1);
});

test("a move that is not ready never arrives, even with a live session", async () => {
	const { calls } = render({ ready: false, live: true }, 5);
	await wait(20);
	expect(calls.arrived).toBe(0);
});
