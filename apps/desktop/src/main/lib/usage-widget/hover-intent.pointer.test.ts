import { expect, test } from "bun:test";
import { FakeClock } from "./fake-clock";
import { HoverIntent, pointInsideBounds } from "./hover-intent";

function fixture() {
	const clock = new FakeClock();
	const shown: string[] = [];
	let hidden = 0;
	let visible = false;
	let point = { x: 2532, y: 224 };
	const bounds = { x: 2230, y: 123, width: 284, height: 204 };
	const hover = new HoverIntent(
		(id) => {
			shown.push(id);
			visible = true;
		},
		() => {
			hidden++;
			visible = false;
		},
		() => visible && pointInsideBounds(point, bounds),
		clock.schedule,
	);
	return {
		clock,
		hover,
		shown,
		get hidden() {
			return hidden;
		},
		point(next: { x: number; y: number }) {
			point = next;
		},
		invisible() {
			visible = false;
		},
	};
}

test("missing preview-enter keeps a pointed-at card open, then dismisses outside", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(300);
	f.hover.leave();
	f.point({ x: 2400, y: 224 });
	f.clock.advance(900);
	expect(f.hover.current).toBe("a");
	expect(f.hidden).toBe(0);
	expect(f.clock.pending).toBe(1);
	f.point({ x: 2220, y: 224 });
	f.clock.advance(180);
	expect(f.hover.current).toBeNull();
	expect(f.hidden).toBe(1);
	expect(f.clock.pending).toBe(0);
});

test("close cancels the pending geometry recheck without stale reopening", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(300);
	f.point({ x: 2400, y: 224 });
	f.hover.leave();
	f.clock.advance(180);
	f.hover.close();
	f.clock.advance(1_000);
	expect(f.hover.current).toBeNull();
	expect(f.shown).toEqual(["a"]);
	expect(f.hidden).toBe(1);
	expect(f.clock.pending).toBe(0);
});

test("switching accounts cancels the old close timer and preserves the new identity", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(300);
	f.point({ x: 2400, y: 224 });
	f.hover.leave();
	f.clock.advance(180);
	f.hover.enter("b");
	f.clock.advance(1_000);
	expect(f.hover.current).toBe("b");
	expect(f.shown).toEqual(["a", "b"]);
	expect(f.hidden).toBe(0);
	expect(f.clock.pending).toBe(0);
	f.hover.close();
});

test("rapid leave and recheck events never accumulate timers", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(300);
	f.point({ x: 2400, y: 224 });
	for (let i = 0; i < 20; i++) f.hover.leave();
	f.clock.advance(1_800);
	expect(f.clock.maximumPending).toBe(1);
	expect(f.clock.pending).toBe(1);
	f.hover.close();
	expect(f.clock.pending).toBe(0);
});

test("an invisible preview or an interrupted dwell never keeps a timer alive", () => {
	const f = fixture();
	f.hover.enter("a");
	f.clock.advance(100);
	f.hover.leave();
	f.point({ x: 2400, y: 224 });
	f.clock.advance(180);
	expect(f.shown).toEqual([]);
	expect(f.clock.pending).toBe(0);
	f.hover.enter("a");
	f.clock.advance(300);
	f.invisible();
	f.hover.leave();
	f.clock.advance(180);
	expect(f.hover.current).toBeNull();
	expect(f.clock.pending).toBe(0);
});

test("DIP containment handles negative display coordinates and exclusive far edges", () => {
	const bounds = { x: -500, y: -200, width: 284, height: 204 };
	expect(pointInsideBounds({ x: -500, y: -200 }, bounds)).toBe(true);
	expect(pointInsideBounds({ x: -217, y: 3 }, bounds)).toBe(true);
	expect(pointInsideBounds({ x: -216, y: 0 }, bounds)).toBe(false);
	expect(pointInsideBounds({ x: -400, y: 4 }, bounds)).toBe(false);
	expect(pointInsideBounds({ x: -501, y: -100 }, bounds)).toBe(false);
});
