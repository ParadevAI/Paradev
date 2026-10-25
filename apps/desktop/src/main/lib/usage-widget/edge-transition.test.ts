import { expect, test } from "bun:test";
import { EdgeTransition } from "./edge-transition";
import { FakeClock } from "./fake-clock";

test("late acknowledgements cannot settle a newer transition", () => {
	const clock = new FakeClock();
	let settled = 0;
	const motion = new EdgeTransition(() => settled++, clock.schedule);
	const opening = motion.begin();
	const closing = motion.begin();
	motion.complete(opening);
	motion.complete(null);
	motion.complete(String(closing));
	expect(motion.current).toBe(closing);
	expect(settled).toBe(0);
	motion.complete(closing);
	motion.complete(closing);
	expect(motion.current).toBeNull();
	expect(settled).toBe(1);
	expect(clock.pending).toBe(0);
});

test("cancelling a surface change invalidates acknowledgements and timers", () => {
	const clock = new FakeClock();
	let settled = 0;
	const motion = new EdgeTransition(() => settled++, clock.schedule);
	const id = motion.begin();
	motion.cancel();
	motion.complete(id);
	clock.advance(1200);
	expect(settled).toBe(0);
	expect(motion.current).toBeNull();
	expect(clock.pending).toBe(0);
});

test("an unresponsive renderer releases its animation canvas at the deadline", () => {
	const clock = new FakeClock();
	let settled = 0;
	const motion = new EdgeTransition(() => settled++, clock.schedule);
	motion.begin();
	clock.advance(1199);
	expect(settled).toBe(0);
	clock.advance(1);
	expect(settled).toBe(1);
	expect(motion.current).toBeNull();
	expect(clock.pending).toBe(0);
});
