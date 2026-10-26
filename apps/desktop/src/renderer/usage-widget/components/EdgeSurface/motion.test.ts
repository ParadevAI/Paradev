import { expect, test } from "bun:test";
import {
	advanceEdge,
	edgeAtRest,
	edgeContour,
	edgeFade,
	restingEdge,
} from "./motion";

const closed = { width: 44, height: 160, openness: 0 };
const open = { width: 392, height: 548, openness: 1 };

test("the first visible frame eases in instead of jumping across the screen", () => {
	const start = restingEdge(closed);
	expect(advanceEdge(start, open, 0)).toEqual(start);
	const first = advanceEdge(start, open, 1 / 60);
	const travel =
		(first.frame.width - closed.width) / (open.width - closed.width);
	expect(travel).toBeGreaterThan(0.03);
	expect(travel).toBeLessThan(0.06);
});
test("open and close converge without overshoot at common refresh rates", () => {
	for (const hz of [30, 60, 120, 144]) {
		for (const [from, to] of [
			[closed, open],
			[open, closed],
		]) {
			let state = restingEdge(from);
			let frames = 0;
			while (!edgeAtRest(state, to) && frames++ < hz) {
				state = advanceEdge(state, to, 1 / hz);
				expect(state.frame.width).toBeGreaterThanOrEqual(closed.width);
				expect(state.frame.width).toBeLessThanOrEqual(open.width);
				expect(state.frame.openness).toBeGreaterThanOrEqual(0);
				expect(state.frame.openness).toBeLessThanOrEqual(1);
			}
			expect(edgeAtRest(state, to)).toBe(true);
			expect(frames / hz).toBeLessThan(0.65);
		}
	}
});
test("rapid reversal retains position and velocity, then closes fully", () => {
	let state = restingEdge(closed);
	for (let frame = 0; frame < 5; frame++)
		state = advanceEdge(state, open, 1 / 60);
	const reversed = advanceEdge(state, closed, 0);
	expect(reversed.frame.width).toBeCloseTo(state.frame.width, 10);
	expect(reversed.velocity.width).toBeCloseTo(state.velocity.width, 10);
	for (let frame = 0; frame < 60; frame++)
		state = advanceEdge(state, closed, 1 / 60);
	expect(edgeAtRest(state, closed)).toBe(true);
});
test("content resize preserves the anchored width and opacity", () => {
	let state = restingEdge(open);
	const compact = { ...open, height: 284 };
	for (let frame = 0; frame < 60; frame++) {
		state = advanceEdge(state, compact, 1 / 60);
		expect(state.frame.width).toBe(open.width);
		expect(state.frame.openness).toBe(1);
	}
	expect(edgeAtRest(state, compact)).toBe(true);
});
test("a delayed frame cannot skip the entire transition", () => {
	const start = restingEdge(closed);
	expect(advanceEdge(start, open, 1)).toEqual(advanceEdge(start, open, 0.032));
});
test("instant settling has zero velocity, bounded fades and joined shoulders", () => {
	expect(edgeAtRest(restingEdge(open), open)).toBe(true);
	expect(edgeFade(-1, 0.15, 0.85)).toBe(0);
	expect(edgeFade(2, 0.15, 0.85)).toBe(1);
	expect(edgeFade(0.5, 0.15, 0.85)).toBeCloseTo(0.5);
	for (const f of [closed, open]) {
		const path = edgeContour(f.width, f.height);
		expect(path.startsWith(`M ${f.width} 0 Q`)).toBe(true);
		expect(path.endsWith(`${f.width} ${f.height} Z`)).toBe(true);
	}
});
