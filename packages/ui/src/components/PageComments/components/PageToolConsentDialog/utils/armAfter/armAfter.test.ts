import { describe, expect, test } from "bun:test";
import { armAfter } from "./armAfter";

function clock() {
	const timers = new Map<number, { run: () => void; ms: number }>();
	let next = 0;
	return {
		timers,
		schedule: (run: () => void, ms: number) => {
			timers.set(++next, { run, ms });
			return next;
		},
		cancel: (handle: unknown) => timers.delete(handle as number),
	};
}

describe("armAfter", () => {
	test("arms only once the delay has passed", () => {
		const c = clock();
		let armed = false;
		armAfter(500, () => (armed = true), c.schedule, c.cancel);
		expect(armed).toBe(false);
		const [timer] = [...c.timers.values()];
		expect(timer?.ms).toBe(500);
		timer?.run();
		expect(armed).toBe(true);
	});

	test("a prompt that closes first never arms", () => {
		const c = clock();
		const stop = armAfter(500, () => {}, c.schedule, c.cancel);
		stop();
		expect(c.timers.size).toBe(0);
	});
});
