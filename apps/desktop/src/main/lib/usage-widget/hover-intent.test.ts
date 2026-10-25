import { expect, test } from "bun:test";
import { FakeClock } from "./fake-clock";
import { HoverIntent } from "./hover-intent";

function fixture() {
	const clock = new FakeClock();
	const shown: string[] = [];
	let hidden = 0;
	const hover = new HoverIntent(
		(id) => shown.push(id),
		() => hidden++,
		() => false,
		clock.schedule,
	);
	return {
		clock,
		shown,
		hover,
		get hidden() {
			return hidden;
		},
	};
}

test("passing across an account does not flash a hover card", () => {
	const f = fixture();
	f.hover.enter("a");
	f.hover.leave();
	f.clock.advance(350);
	expect(f.shown).toEqual([]);
	expect(f.hover.current).toBeNull();
	expect(f.clock.pending).toBe(0);
});

test("crossing into the preview preserves the visible account", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(300);
	f.hover.leave();
	f.hover.enter("a");
	f.clock.advance(210);
	expect(f.shown).toEqual(["a"]);
	expect(f.hidden).toBe(0);
	expect(f.hover.current).toBe("a");
	f.hover.close();
	expect(f.clock.pending).toBe(0);
});

test("switching visible accounts cancels the previous close timer", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(300);
	f.hover.leave();
	f.hover.enter("b");
	f.clock.advance(210);
	expect(f.shown).toEqual(["a", "b"]);
	expect(f.hover.current).toBe("b");
	f.hover.leave();
	f.clock.advance(180);
	expect(f.hover.current).toBeNull();
	expect(f.clock.pending).toBe(0);
});

test("closing cancels a pending dwell and prevents stale opening", () => {
	const f = fixture();
	f.hover.enter("a");
	f.hover.close();
	f.clock.advance(350);
	expect(f.shown).toEqual([]);
	expect(f.hover.current).toBeNull();
	expect(f.clock.pending).toBe(0);
});
